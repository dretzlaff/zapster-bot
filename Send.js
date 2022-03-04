const TWILIO_URL = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_ID}/Messages.json`;

const FILE_IDS = {
  ZAP_25: "1eydrR8am1wgysks46Ai3NiPwr9SUWCsV",
  ZAP_75: "1OU9ntiYwaszqH6r1nObeM8_smYUsFNfd",
  ZAP_125: "1-7KFH-NcdVEgd4zdd6ivqni7QlElyUJq"
};

function send(notification) {
  if (notification.contact.match(/^\S+@(\S+\.)+\S+$/)) {
    sendEmail(notification);
  } else if (notification.contact.match(/^[\d-]+/)) {
    sendSms(notification);
  } else {
    throw 'Unrecognized contact format';
  }
}

function replaceLastComma(string, replacement) {
  var lastCommaIdx = string.lastIndexOf(",");
  if (lastCommaIdx > 0) {
    string =
      string.substring(0, lastCommaIdx)
        + " "
        + replacement
        + string.substring(lastCommaIdx + 1);
  }
  return string;
}

function renderTemplate(notification, medium) {
  var template = HtmlService.createTemplateFromFile(notification.type + medium);
  template.notification = notification;
  template.links = {
    unsubscribe: ScriptApp.getService().getUrl() + "?action=unsub&contact=" + encodeURIComponent(notification.contact)
  }
  if (notification.studentNames) {
    template.studentNamesOr = replaceLastComma(notification.studentNames, "or");
  }
  template.multipleTags = notification.tags && notification.tags.toString().includes(",");
  if (notification.tags) {
    template.tagsAnd = replaceLastComma(notification.tags.toString(), "and");
  }
  if (notification.totalZaps) {
    var buttonFileId;
    if (notification.totalZaps < 25) {
      template.buttonZaps = 25;
      buttonFileId = FILE_IDS.ZAP_25;
    } else if (notification.totalZaps < 75) {
      template.buttonZaps = 75;
      buttonFileId = FILE_IDS.ZAP_75;
    } else if (notification.totalZaps < 125) {
      template.buttonZaps = 125;
      buttonFileId = FILE_IDS.ZAP_125;
    }
    if (buttonFileId) {
      template.buttonUrl = "https://drive.google.com/uc?export=download&id=" + buttonFileId;
    }
  }
  return template.evaluate().getContent();
}

function sendEmail(notification) {
  var htmlBody = renderTemplate(notification, "Email");
  var textBody = toPlainText(htmlBody);
  var subject = "Zapster";
  if (notification.studentNames.lastIndexOf(",") > 0) {
    subject += "s";
  }
  var firstNames = notification.studentNames.replaceAll(/(\w) [^,]+/g, "$1");
  subject += " " + replaceLastComma(firstNames, "and");

  // Start a new zap thread each month.
  if (notification.type == "Zap") {
    subject += ", " + Utilities.formatDate(SCRIPT_EXECUTION_TIME, Session.getTimeZone(), "MMMM yyyy");
  }

/*
  var unsubUrl = ScriptApp.getService().getUrl() + "?action=unsub&contact=" + encodeURIComponent(notification.contact);
  var draft = GmailApp.createDraft(notification.contact, subject, "ignoredBody", {
    name: "Zapster Bot",
    replyTo: "Zapsters <zapsters@rocv.org>",
    htmlBody: htmlBody
  });
  var rawBytes = draft.getMessage().getRawContent();
  draft.deleteDraft();

  rawBytes = `List-Unsubscribe: <${unsubUrl}>\n` + rawBytes;
  Gmail.Users.Messages.send({raw: Utilities.base64EncodeWebSafe(rawBytes)}, "me");
*/
  mailApp.sendEmail({
    name: "Zapster Bot",
    replyTo: "Zapsters <zapsters@rocv.org>",
    to: notification.contact,
    subject: subject,
    htmlBody: htmlBody,
    body: textBody
  })
}

function sendSms(notification) {
  var content = renderTemplate(notification, "Sms");
  var messageList = content.split("\n\n").map(s => s.replaceAll(/\s+/g, " "));

  var toNumber = notification.contact.replaceAll(/\D/g, "");
  if (toNumber.length != 10) {
    throw `Expected 10-digit US phone number, got '${notification.contact}'`;
  }
  toNumber = "+1" + toNumber;

  messageList.forEach(message => {
    var options = {
      'method': 'post',
      'headers': {
        'Authorization': 'Basic ' + Utilities.base64Encode(TWILIO_ACCOUNT_ID + ":" + TWILIO_AUTH_TOKEN)
      },
      'payload': {
        'To': toNumber,
        'MessagingServiceSid': TWILIO_SERVICE_ID,
        'Body': message
      }
    };
    urlFetchApp.fetch(TWILIO_URL, options);
  });
}

function toPlainText(htmlBody) {
  htmlBody = htmlBody.replaceAll("<li>", "\n - "); // dashes for <ul> items
  htmlBody = htmlBody.replaceAll(/<[^>]+?>/g, ""); // no tags
  htmlBody = htmlBody.replaceAll(/^[ \t]+/mg, "").replaceAll(/[ \t]+$/mg, ""); // no leading/trailing spaces
  htmlBody = htmlBody.replaceAll(/\n([^\n])/mg, function(m, c) { // concat lines together unless there are 2 \n
    return " " + c;
  });
  htmlBody = htmlBody.replaceAll(/^[ \t]+/mg, ""); // remove extra leading space introduced in previous line
  htmlBody = htmlBody.replaceAll(/\n\n\n/g, "\n\n"); // no double blank lines
  htmlBody = htmlBody.replaceAll(/ +/g, " ");
  htmlBody = htmlBody.replaceAll(" or simply unsubscribe", ""); // this was a link and doesn't make sense.
  return htmlBody.trim();
}
