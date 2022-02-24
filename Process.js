const MAX_NOTIFY_ATTEMPTS = 5;

// variables that take different values for prod vs test
var sheetData = null;
var mailApp = null;
var urlFetchApp = null;

function processAll() {
  processTagNotices();
  processZaps();
  processNotifications();
}

function openSpreadsheet(spreadsheetId) {
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  return {
    zaps: new SheetData_(spreadsheet, "Zaps"),
    tags: new SheetData_(spreadsheet, "Tags"),
    contacts: new SheetData_(spreadsheet, "Contacts"),
    notifications: new SheetData_(spreadsheet, "Notifications"),
    battery: new SheetData_(spreadsheet, "Battery")
  }
}

/**
 * Processes Tags to make sure emails and phone numbers in Tags.notify have
 * Contacts rows that point to them. Welcome and TagNotify notifications are
 * scheduled for changes.
 */
function processTagNotices() {
  // Use Tags.notify to build a map from contacts' email/phone to an
  // array of tags. At the end of this function, Contacts.tags will match
  // this notifyToTags map.
  var notifyToTags = {};
  sheetData.tags.getRows().forEach(tag => {
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
  for (notify in notifyToTags) {
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
    } else if (contacts[notify].studentNames != notifyToTags[notify]) {
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
  sheetData.contacts.getRows().forEach(c => {
    if (c.tags && !notifyToTags[c.contact]) {
      c.tags = null;
    }
  });
}

/**
 * Processes Zaps by looking up the student by tag and scheduling
 * zap notifications.
 */
function processZaps() {
  var tags = sheetData.tags.withLookup(t => t.tag);
  sheetData.zaps.getRows().forEach(zap => {
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
}

/**
 * Returns a map from student name to {totalZap and totalDistance}.
 */
function getZapTotals() {
  var totals = {};
  var processed = {}; // only process first row for each student and date
  sheetData.zaps.getRows().forEach(zap => {
    var key = Utilities.formatDate(zap.zapTime, Session.getTimeZone(), "yyyy-MM-dd") + ":" + zap.studentName;
    if (key in processed) {
      return;
    }
    processed[key] = true;

    studentTotals = totals[zap.studentName];
    if (!studentTotals) {
      studentTotals = {
        totalZaps: 0,
        totalDistance: 0
      };
      totals[zap.studentName] = studentTotals;
    }
    studentTotals.totalZaps += 1;
    studentTotals.totalDistance += zap.distance;
  });
  return totals;
}

function processNotifications() {
  var tags = sheetData.tags.withLookup(t => t.tag);
  var zapTotals = null; // lazy load
  sheetData.notifications.getRows()
    .filter(n => n.lastStatus != "Complete" &&  n.attempts < MAX_NOTIFY_ATTEMPTS)
    .forEach(notification => {
      notification.studentNames =
        splitToArray_(notification.tags)
          .map(t => tags[t].studentName)
          .join(', ');

      // Compute total zaps and distance for Zap notifications.
      if (notification.type == 'Zap') {
        if (!zapTotals) {
          zapTotals = getZapTotals();
        }
        // Assume zap notifications have a single student.
        var studentTotals = zapTotals[notification.studentNames];
        notification.totalZaps = studentTotals.totalZaps;
        notification.totalDistance = studentTotals.totalDistance;
      }

      try {
        if (notification.attempts) {
          notification.attempts += 1;
        } else {
          notification.attempts = 1;
        }

        var label = `Notifying ${JSON.stringify(notification)}`
        console.time(label);
        send(notification);
        console.timeEnd(label);

        notification.lastStatus = "Complete";
      } catch (e) {
        console.warn(`Exception notifying '${notification.recipient}: ${JSON.stringify(e)}\n${e.stack}`)
        notification.lastStatus = e.toString();
        // throw e;
      }
    });
}

function splitToArray_(value) {
  if (value) {
    return value.toString().split(/[,\s]+/).filter(s => s.length > 0);
  } else {
    return [];
  }
}
