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
 * Sends Welcome and TagNotify notifications based on new/changed
 * Tags.notify column values. 
 */
function processTagNotices() {
  // Use "Tags" to build a map from contacts' email/phone to an
  // array of tags. At the end of this function, the "tags" column
  // of "Contacts" will match this.
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

function processNotifications() {
  // Make a quick contact lookup map.
  var tags = sheetData.tags.withLookup(t => t.tag);
  sheetData.notifications.getRows()
    .filter(n => n.lastStatus != "Complete" &&  n.attempts < MAX_NOTIFY_ATTEMPTS)
    .forEach(notification => {
      notification.studentNames =
        splitToArray_(notification.tags)
          .map(t => tags[t].studentName)
          .join(', ');

      // Compute total zaps and distance for Zap notifications.
      if (notification.type == 'Zap') {
        // Accumulate into local variables to avoid Sheets API calls for each zap.
        var totalZaps = 0;
        var totalDistance = 0.0;
        sheetData.zaps.getRows()
          // We assume here that Zap notifications have a single studentName.
          // Accumulate by name instead of tag to gracefully handle replacement tags.
          .filter(zap => zap.studentName == notification.studentNames)
          .forEach(zap => {
            totalZaps += 1;
            totalDistance += zap.distance;
          });
        notification.totalZaps = totalZaps;
        notification.totalDistance = totalDistance;
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
