/**
 * Does *all* the processing.
 */
function periodicTrigger() {
  // Send out notifications for tag changes go out. Includes zap processing
  // to pick up any previously unassigned tags.
  webappTrigger();

  // Weekly green gear award email.
  processGreenGear();

  // Alerts.
  checkForRecentStatus();
  checkForStuckNotifications();
  console.info("We're all good.");
}

/**
 * Process zaps and notifications in response to a webapp execution. This
 * method allows the webapp execution to schedule processing without delay
 * but return its response immediately.
 */
function scheduleWebappTrigger() {
  ScriptApp.newTrigger("webappTrigger").timeBased().at(new Date()).create();
}
function webappTrigger(e) {
  if (e) {
    ScriptApp.getProjectTriggers()
      .filter(t => t.getUniqueId() == e.triggerUid)
      .forEach(t => ScriptApp.deleteTrigger(t));
  }

  setupProd();
  processTagNotices();
  processZaps();
  processNotifications();
}

/**
 * Processes Tags to make sure emails and phone numbers in Tags.notify have
 * Contacts rows that point to them. Welcome and TagNotify notifications are
 * scheduled for changes.
 */
function processTagNotices() {
  var lock = waitForScriptLock();

  // Use Tags.notify to build a map from contacts' email/phone to an
  // array of tags. At the end of this function, Contacts.tags will match
  // this notifyToTags map.
  var notifyToTags = {};
  sheetData.tags.forEach(tag => {
    splitToArray_(tag.notify).forEach(notify => {
      var tags = notifyToTags[notify];
      if (!tags) {
        tags = notifyToTags[notify] = [];
      }
      tags.push(tag.tag);
      tags.sort();
    });
  });
  // Make a quick contact lookup map.
  var contacts = sheetData.contacts.withLookup(c => c.contact);
  // Create or update Contact rows and schedule notifications.
  for (var notify in notifyToTags) {
    var tags = notifyToTags[notify].join(', ');
    if (!contacts[notify]) {
      // Create a new contact row and schedule a welcome
      console.info(`Scheduling Welcome for ${notify}`);
      sheetData.contacts.append({
        contact: notify,
        tags: tags
      });
      sheetData.notifications.append({
        contact: notify,
        type: 'Welcome',
        tags: tags
      });
    } else if (contacts[notify].tags != tags) {
      // Update the contact row's student names and schedule a notification
      console.info(`Scheduling TagNotify for ${notify}`);
      contacts[notify].tags = tags;
      sheetData.notifications.append({
        contact: notify,
        type: 'TagNotify',
        tags: tags
      });
    }
  }
  // Clear student names from contacts who've been removed from all
  // student notification lists.
  sheetData.contacts.forEach(c => {
    if (c.tags && !notifyToTags[c.contact]) {
      c.tags = null;
    }
  });
  lock.releaseLock();
}

/**
 * Processes Zaps by looking up the student by tag and scheduling
 * zap notifications.
 */
function processZaps() {
  var lock = waitForScriptLock();
  var tags = sheetData.tags.withLookup(t => t.tag);
  sheetData.zaps.forEach(zap => {
    if (zap.studentName) {
      return; // already processed
    }
    var tag = tags[zap.tag];
    if (!tag) {
      console.warn(`No student for tag ${zap.tag}`);
      return;
    }

    // Populate name and distance columns
    zap.studentName = tag.studentName;
    zap.distance = tag.distance;
    tag.lastZap = zap.zapTime;

    // Create notifications
    splitToArray_(tag.notify).forEach(contact => {
      sheetData.notifications.append({
        contact: contact,
        type: 'Zap',
        tags: zap.tag,
        zapTime: zap.zapTime
      });
    });
  });
  lock.releaseLock();
}

function processNotifications() {
  var lock = waitForScriptLock();

  var notifications = sheetData.notifications
    .filter(shouldProcessNotification)
    .filter(n => !n.attempts || n.attempts < MAX_NOTIFY_ATTEMPTS);
  if (notifications.length == 0) {
    return; // avoid creating tag lookup map, etc.
  }
  
  notifications.forEach(notification => {
    if (notification.attempts) {
      notification.attempts += 1;
    } else {
      notification.attempts = 1;
    }
    // Copy time so we get a snapshot; tests can modify SCRIPT_EXECUTION_TIME.
    notification.lastAttempt = new Date(SCRIPT_EXECUTION_TIME);
  });

  // Release the lock to allow other processing to occur, since we can't really
  // control notification execution time. The rows in "notifications" won't be
  // modified for at least MIN_RETRY_WAIT_MILLIS (except by this execution instance).
  SpreadsheetApp.flush();
  lock.releaseLock();

  // There is some funny business if you end up calling getScriptLock() multiple
  // times. I think I have it worked out, but I'm leaving this sanity check in.
  if (lock.hasLock() || LockService.getScriptLock().hasLock()) {
    throw Error("failed to release script lock");
  }

  var tags = sheetData.tags.withLookup(t => t.tag);
  var contacts = sheetData.contacts.withLookup(c => c.contact);
  notifications.forEach(notification => {
      notification.studentNames =
        splitToArray_(notification.tags)
          .map(t => tags[t].studentName)
          .join(', ');

      // Compute total zaps and distance for Zap notifications.
      if (notification.type == 'Zap') {
        // Assume zap notifications have a single student.
        var studentTotals = getZapTotals(notification.studentNames);
        notification.totalZaps = studentTotals.totalZaps;
        notification.totalDistance = studentTotals.totalDistance;
      }

      try {
        var contact = contacts[notification.contact];
        if (!contact) {
          throw Error(notification.contact + " missing from Contacts sheet");
        }
        var unsubTime = contact.unsubscribed;
        if (unsubTime) {
          notification.lastStatus = "Unsubbed " + unsubTime;
        } else {
          var label = `Notifying ${JSON.stringify(notification)}`
          console.time(label);
          send(notification);
          console.timeEnd(label);
          notification.lastStatus = "Complete";
        }
      } catch (e) {
        console.warn(`Exception notifying '${notification.recipient}: ${JSON.stringify(e)}\n${e.stack}`)
        notification.lastStatus = e.toString();
        // throw e;
      }
    });
}

/**
 * Function for manual execution that creates slides and emails for all assigned winners.
 */
function backfillGreenGear() {
  setupProd();
  var presentation = openGreenGearPresentation(SCRIPT_EXECUTION_TIME);
  sheetData.winners.forEach(winner => {
    if (winner.studentName) {
      createGreenGearCertificate(presentation, winner);
    }
  });
}

function processGreenGear() {
  var upToDate = new Date(SCRIPT_EXECUTION_TIME.getTime() + 2 * 24 * 3600 * 1000); // 2 days
  console.info("Looking for green gear awards before " + upToDate);
  var presentation = openGreenGearPresentation(SCRIPT_EXECUTION_TIME);

  var allWinners = sheetData.winners.withLookup(w => w.studentName);
  var tags = sheetData.tags.withLookup(t => t.tag);

  var previousWinner = null;
  sheetData.winners.forEach(winner => {
    if (winner.date.getTime() < upToDate.getTime() && winner.studentName == "") {
      var candidates = sheetData.zaps
        .filter(zap => {
          return (previousWinner == null || zap.zapTime.getTime() > previousWinner.date.getTime())
              && zap.zapTime.getTime() < winner.date.getTime();
        })
        .filter(zap => zap.studentName)
        .filter(zap => !(zap.studentName in allWinners)); // don't let anyone win twice

      if (candidates.length == 0) {
        throw new Error(`No zaps between ${previousWinner ? previousWinner.date : 'null'} and ${winner.date}`);
      }
      var winningZapIndex = Math.floor(Math.random() * candidates.length);
      var winningZap = candidates[winningZapIndex];
      console.info(`Green Gear winner is #${winningZapIndex} of ${candidates.length}: ${winningZap.studentName}, ${winningZap.zapTime}`);

      winner.studentName = winningZap.studentName;
      winner.classCode = tags[winningZap.tag].classCode;
      createGreenGearCertificate(presentation, winner);
    }
    previousWinner = winner;
  });
}

function createGreenGearCertificate(presentation, winner) {
  var grade = formatGrade(winner.classCode);
  var formattedDate = Utilities.formatDate(winner.date, Session.getTimeZone(), "MMMM d, yyyy");
  console.info(`Creating Green Gear certificate for '${winner.studentName}' in ${grade} on ${formattedDate}: ${winner.prize}`);
  var newSlide = presentation.getSlides()[0].duplicate();
  newSlide.getShapes().forEach(shape => {
    if (shape.getPageElementType() == SlidesApp.PageElementType.SHAPE) {
      var text = shape.getText();
      text.replaceAllText("STUDENT", winner.studentName);
      text.replaceAllText("GG", grade);
      text.replaceAllText("DDDD", formattedDate);
      text.replaceAllText("PRIZE", winner.prize);
    }
  });

  var studentTotals = getZapTotals(winner.studentName);
  if (!studentTotals) {
    console.info(`Skipping email for unknown student ${winner.studentName}.`);
    return;
  }
  var body = `${winner.studentName} is the Green Gear winner for the week of ${formattedDate}.\n`;
  body += `${grade} grade, ${studentTotals.totalZaps} zaps and ${studentTotals.totalDistance} miles this school year.\n\n`;
  body += "https://docs.google.com/presentation/d/" + presentation.getId() + "#slide=id." + newSlide.getObjectId();

  mailApp.sendEmail({
    to: GREEN_GEAR_RECIP,
    name: "Zapster Bot",
    subject: `Zapsters winner for ${formattedDate}`,
    body: body
  });
}

function formatGrade(classCode) {
  switch (classCode[0]) {
    case 'K': return "Kindergarten";
    case '1': return "1st";
    case '2': return "2nd";
    case '3': return "3rd";
    default: return classCode[0] + "th";
  }
}

function checkForRecentStatus() {
  var lastStatusTime = sheetData.battery.map(b => b.statusTime).reduce((a,b) => Math.max(a,b), null);
  if (!lastStatusTime) {
    console.log("No battery status data. NOT alerting.")
    return;
  }
  var ageMillis = SCRIPT_EXECUTION_TIME.getTime() - lastStatusTime;
  var ageHours = ageMillis / (3600 * 1000);
  var message = "Last status update was " + ageHours.toFixed(1) + " hours ago.";
  console.info(message);
  if (ageHours > STALE_STATUS_ALERT_HOURS) {
    throw new Error(message);
  }
}

function checkForStuckNotifications() {
  var oneDayAgo = new Date(SCRIPT_EXECUTION_TIME.getTime() - 24 * 3600 * 1000);
  var stuck = sheetData.notifications
    .filter(shouldProcessNotification)
    .filter(n => n.attempts >= MAX_NOTIFY_ATTEMPTS)
    .filter(n => n.lastAttempt.getTime() > oneDayAgo.getTime())
  if (stuck.length > 0) {
    var message = stuck.length + " stuck notifications in the last 24 hours.";
    message += " Example: " + stuck[0].lastStatus;
    throw new Error(message);
  }
}

function shouldProcessNotification(notification) {
  var maxLastAttempt = SCRIPT_EXECUTION_TIME.getTime() - MIN_NOTIFY_RETRY_WAIT_MILLIS;
  return notification.lastStatus != "Complete"
      && !notification.lastStatus.startsWith("Unsubbed")
      && (!notification.lastAttempt || notification.lastAttempt.getTime() <= maxLastAttempt);
}

/**
 * Returns a map from student name to {totalZap and totalDistance}.
 */
var zapTotals_ = null;
function getZapTotals(studentName) {
  if (zapTotals_) {
    return zapTotals_[studentName];
  }
  zapTotals_ = {};
  var processed = {}; // only process first row for each student and date
  sheetData.zaps.forEach(zap => {
    var key = Utilities.formatDate(zap.zapTime, Session.getTimeZone(), "yyyy-MM-dd") + ":" + zap.studentName;
    if (key in processed) {
      return;
    }
    processed[key] = true;

    studentTotals = zapTotals_[zap.studentName];
    if (!studentTotals) {
      studentTotals = {
        totalZaps: 0,
        totalDistance: 0
      };
      zapTotals_[zap.studentName] = studentTotals;
    }
    studentTotals.totalZaps += 1;
    studentTotals.totalDistance += zap.distance;
  });
  // make sure we don't have distances like "7.799999999999998"
  Object.keys(zapTotals_).forEach(k => {
    zapTotals_[k].totalDistance = Math.round((zapTotals_[k].totalDistance + Number.EPSILON) * 100) / 100;
  })
  return zapTotals_[studentName];
}

function waitForScriptLock() {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MILLIS);
  return lock;
}

function splitToArray_(value) {
  if (value) {
    return value.toString().split(/[,\s]+/).filter(s => s.length > 0);
  } else {
    return [];
  }
}
