function doGet(e) {
  setupProd();
  waitForScriptLock();
  var output = ContentService.createTextOutput();
  if (!e.parameter.cid) {
    output.append("missing 'cid' parameter for subscription  request");
    return output;
  }
  var contact = sheetData.contacts.find(c => computeContactDigest(c.contact) == e.parameter.cid);
  if (!contact) {
    output.append("cannot find contact for cid=" + e.parameter.cid);
    return output;
  }

  output.append("<html><body>" + contact.contact + " is now ");
  var link = "?cid=" + e.parameter.cid;
  if (e.parameter.resub) {
      contact.unsubscribed = null;
      output.append("<b>subscribed</b>");
  } else {
      contact.unsubscribed = SCRIPT_EXECUTION_TIME;
      output.append("<b>unsubscribed</b>");
      link += "&resub=1";
  }
  output.append(" to Zapster Bot notifications.");
  output.append(" <a href=\"" + link + "\">[Undo]</a></body></html>");
  return output;
}

function doPost(e) {
  // Subscription request
  if (e.parameter.cid) {
    return doGet(e);
  }
  setupProd();
  waitForScriptLock();
  var response = {};
  if (e.parameter.StationId != REQUIRED_STATION_ID) {
    response.error = "Invalid StationId";
  } else {
    var batteryKeys = {};
    sheetData.battery.forEach(b => {
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
    sheetData.zaps.forEach(z => {
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
