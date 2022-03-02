function doGet(e) {
  setupProd();
  waitForScriptLock();
  var output = HtmlService.createHtmlOutput();
  if (!e.parameter.contact) {
    output.append("missing 'contact' parameter for subscription  request");
    return output;
  }
  if (!["sub", "unsub"].includes(e.parameter.action)) {
    output.append("unknown action");
    return output;
  }
  var contact = sheetData.contacts.getRows().find(c => c.contact == e.parameter.contact);
  if (!contact) {
    output.append(e.parameter.contact + " not found");
    return output;
  }

  output = HtmlService.createHtmlOutput();
  output.append("<html><body>" + e.parameter.contact + " is now ");
  var undo;
  switch (e.parameter.action) {
    case "sub":
      contact.unsubscribed = null;
      output.append("<b>subscribed</b>");
      undo = "unsub";
      break;
    case "unsub":
      contact.unsubscribed = SCRIPT_EXECUTION_TIME;
      output.append("<b>unsubscribed</b>");
      undo = "sub";
      break;
    default:
      throw Error("unexpected action: " + e.parameter.action);
  }
  output.append(" to Zapster Bot notifications.");
  var link = ScriptApp.getService().getUrl();
  link += "?action=" + undo + "&contact=" + encodeURIComponent(e.parameter.contact);
  output.append(" <a href=\"" + link + "\" target=\"_top\">[Undo]</a></body></html>");
  return output;
}

function doPost(e) {
  setupProd();
  waitForScriptLock();
  var response = {};
  if (e.parameter.StationId != REQUIRED_STATION_ID) {
    response.error = "Invalid StationId";
  } else {
    var batteryKeys = {};
    sheetData.battery.getRows().forEach(b => {
      batteryKeys[b.statusTime] = true; // use statusTime for idempotency
    });
    for (var i = 0; i < e.parameter.statusEventCount || 0; ++i) {
      var statusTime = new Date(1000 * parseInt(e.parameter["DateTime" + i]));
      if (statusTime in batteryKeys) {
        response.dupStatus = (response.dupStatus || 0) + 1
      } else {
        response.newStatus = (response.newStatus || 0) + 1
        batteryKeys[statusTime] = true;
        sheetData.battery.append({
          statusTime: statusTime,
          battery: e.parameter["BatteryVoltage" + i],
          solar: e.parameter["SolarOutput" + i]
        });
      }
    }

    var zapKeys = {};
    sheetData.zaps.getRows().forEach(z => {
      var zapKey = z.tag + "@" + Utilities.formatDate(z.zapTime, Session.getTimeZone(), "yyyy-MM-dd'T'HH");
      zapKeys[zapKey] = true; // use tag+hour for idempotency
    });
    for (var i = 0; i < e.parameter.bikeEventCount || 0; ++i) {
      var zapTime = new Date(1000 * parseInt(e.parameter["BikeDateTime" + i]));
      var tag = e.parameter["RfidNum" + i].replace(/^0*DE/, '');
      var zapKey = tag + "@" + Utilities.formatDate(zapTime, Session.getTimeZone(), "yyyy-MM-dd'T'HH");
      if (zapKey in zapKeys) {
        response.dupZap = (response.dupZap || 0) + 1
      } else {
        response.newZap = (response.newZap || 0) + 1
        zapKeys[zapKey] = true;
        sheetData.zaps.append({
          zapTime: zapTime,
          tag: tag
        });
      }
    }
    if (e.parameter.bikeEventCount > 0) {
      scheduleWebappTrigger();
    }
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
