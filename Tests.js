// TODO: make sure "truncation" leaves at least one empty row.

function allTests() {
  unitTests();
  welcomeTest();
  zapProcessTest();
  zapPostTest();
  unsubscribeTest();
  sendExceptionTest();
}

function integrationTestSetup() {
  // truncate test spreadsheet content, keeping headers.
  setupTest(new Date("2021-09-01"));

  mailApp = {
    allEmails: [],
    sendEmail: function(email) {
      this.testEmail = email;
      this.allEmails.push(this.testEmail);
    }
  };
  // mailApp = MailApp; // uncomment to send email from tests
  urlFetchApp = {
    allRequests: [],
    fetch: function(url, options) {
      this.testRequest = {
        url: url,
        options: options
      };
      this.allRequests.push(this.testRequest);
    }
  };

  sheetData.tags.append({
    tag: 123456789,
    studentName: 'Joe Blow',
    guardians: 'joesdad@gmail.com, joesmom@gmail.com',
    notify: 'dretzlaff+mrblow@gmail.com, 858-442-0289',
    distance: 0.5,
    created: '12/14/2021'
  });
  sheetData.tags.append({
    tag: 987654321,
    studentName: 'Jane Blow',
    guardians: 'dretzlaff+mrblow@gmail.com',
    notify: 'dretzlaff+mrblow@gmail.com, 858-442-0289',
    distance: 1.5,
    created: '12/15/2021'
  });
  sheetData.zaps.append({
    zapTime: '12/15/2021 8:45:00',
    tag: '123456789'
  });
  sheetData.zaps.append({
    zapTime: '12/15/2021 14:46:00',
    tag: '123456789'
  });
}

function welcomeTest() {
  integrationTestSetup();

  processTagNotices();

  var emailContact = sheetData.contacts.getRows()[0];
  assertEquals_("dretzlaff+mrblow@gmail.com", emailContact.contact);
  assertEquals_("123456789, 987654321", emailContact.tags);

  var smsContact = sheetData.contacts.getRows()[1];
  assertEquals_("858-442-0289", smsContact.contact);
  assertEquals_("123456789, 987654321", emailContact.tags);

  var emailNotification = sheetData.notifications.getRows()[0];
  assertEquals_("Welcome", emailNotification.type);

  processNotifications();

  assertEquals_(
    "Hi, this is Zapster Bot from ROCV. I’ll email you whenever Joe Blow or Jane Blow zaps at the Crest View bike racks. " +
    "Specifically, I'm looking for tags 123456789 and 987654321.\n\n" +
    "If you have questions or requests, you can respond to these emails and the Zapsters coordinator will get back to you.\n\n" +
    "That’s it for now. I hope I can write you again soon. Thanks for supporting self-powered commuting!\n\n" +
    "Sincerely,\n" +
    "Zapster Bot\n\n" +
    "Zapsters is a self-powered commuting program from Reach Out Crest View. To change your notification preferences, reply to this email.",
    mailApp.testEmail.body);

  assertEquals_(3, urlFetchApp.allRequests.length);
  assertEquals_(
    "Hi, this is Zapster Bot from ROCV. I’ll text you whenever Joe Blow or Jane Blow zaps at the Crest View bike racks. " +
    "Specifically, I'm looking for tags 123456789 and 987654321.",
    urlFetchApp.allRequests[0].options.payload.Body);
  assertEquals_(
    "I always send from this number, so you might add it to your " +
    "contacts. Reply STOP if you’ve heard enough, or email " +
    "crestviewzapsters@gmail.com for anything else.",
    urlFetchApp.allRequests[1].options.payload.Body);
  assertEquals_(
    "That’s it for now. I hope I can text you again soon. Thanks for supporting self-powered commuting!",
    urlFetchApp.allRequests[2].options.payload.Body);

  // Clear one of the two tags' references to the two contacts. This should result
  // in one SMS and one email update.
  var joeTag = sheetData.tags.getRows()[0];
  assertEquals_("Joe Blow", joeTag.studentName); // make sure we got the right row
  joeTag.notify = null;

  assertEquals_(1, mailApp.allEmails.length);
  processTagNotices();
  processNotifications();

  var emailNotice = sheetData.notifications.getRows()[2];
  assertEquals_("TagNotify", emailNotice.type);
  assertEquals_("dretzlaff+mrblow@gmail.com", emailNotice.contact);
  assertEquals_(987654321, emailNotice.tags);

  var smsNotice = sheetData.notifications.getRows()[3];
  assertEquals_("TagNotify", smsNotice.type);
  assertEquals_("858-442-0289", smsNotice.contact);
  assertEquals_(987654321, smsNotice.tags);

  assertEquals_(2, mailApp.allEmails.length);

  assertEquals_(
    "Hi, this is Zapster Bot from ROCV. I’ll email you whenever Jane Blow zaps at the Crest View bike racks. " +
    "Specifically, I'm looking for tag 987654321.\n\n" +
    "If you have questions or requests, you can respond to these emails and the Zapsters coordinator will get back to you.\n\n" +
    "That’s it for now. I hope I can write you again soon. Thanks for supporting self-powered commuting!\n\n" +
    "Sincerely,\n" +
    "Zapster Bot\n\n" +
    "Zapsters is a self-powered commuting program from Reach Out Crest View. To change your notification preferences, reply to this email.",
    mailApp.testEmail.body);

  assertEquals_(4, urlFetchApp.allRequests.length); // just one more; no STOP or thanks message.
  assertEquals_(
    "Hi, this is Zapster Bot from ROCV. I’ll text you whenever Jane Blow zaps at the Crest View bike racks. " +
    "Specifically, I'm looking for tag 987654321.",
    urlFetchApp.allRequests[3].options.payload.Body);

  // Removing the last references to the two contacts. Their contact rows should be updated, but no new SMS
  // or emails should be sent.
  var janeTag = sheetData.tags.getRows()[1];
  assertEquals_("Jane Blow", janeTag.studentName); // make sure we got the right row
  janeTag.notify = null;

  processTagNotices();
  processNotifications();

  assertEquals_(2, mailApp.allEmails.length);
  assertEquals_(4, urlFetchApp.allRequests.length);

  assertEquals_("dretzlaff+mrblow@gmail.com", emailContact.contact);
  assertEquals_(null, emailContact.tags);

  assertEquals_("858-442-0289", smsContact.contact);
  assertEquals_(null, emailContact.tags);

  console.info("welcomeTest PASS");
}

function sendExceptionTest() {
  integrationTestSetup();

  urlFetchApp.fetch = function(url, options) {
    throw 'test exception';
  }

  processZaps();
  processNotifications();

  notifyEmail = sheetData.notifications.getRows()[0];
  assertEquals_(1, notifyEmail.attempts);
  assertEquals_("Complete", notifyEmail.lastStatus);

  notifySms = sheetData.notifications.getRows()[1];
  assertEquals_(1, notifySms.attempts);
  if (!notifySms.lastStatus.includes("test exception")) {
    throw 'Expected "test exception", not: ' + notifySms.lastStatus;
  }

  // get it into a permanent failure.
  processNotifications();
  processNotifications();
  processNotifications();
  processNotifications();
  assertEquals_(5, notifySms.attempts);

  // no more attempts once we've reached MAX_NOTIFY_ATTEMPTS=5.
  processNotifications();
  assertEquals_(5, notifySms.attempts);
  console.info("sendExceptionTest PASS");
}

function zapProcessTest() {
  integrationTestSetup();

  processZaps();
  
  // check the day's second zap
  var joeZap = sheetData.zaps.getRows()[1]
  assertEquals_("Joe Blow", joeZap.studentName);
  assertEquals_(0.5, joeZap.distance);

  var joe = sheetData.tags.getRows()[0];
  assertEquals_(joeZap.zapTime, joe.lastZap);

  // use first zap for the rest of our assertions
  joeZap = sheetData.zaps.getRows()[0]
  assertEquals_("Joe Blow", joeZap.studentName);
  assertEquals_(0.5, joeZap.distance);

  var notifyEmail = sheetData.notifications.getRows()[0];
  assertEquals_(joeZap.zapTime, notifyEmail.zapTime);
  assertEquals_(joeZap.studentName, "Joe Blow");
  assertEquals_("dretzlaff+mrblow@gmail.com", notifyEmail.contact);
  assertEquals_(123456789, notifyEmail.tags);
  assertEquals_("", notifyEmail.attempts);
  assertEquals_("", notifyEmail.lastStatus);

  var notifySms = sheetData.notifications.getRows()[1];
  assertEquals_("858-442-0289", notifySms.contact);

  processNotifications();

  notifyEmail = sheetData.notifications.getRows()[0];
  assertEquals_(1, notifyEmail.attempts);
  assertEquals_("Complete", notifyEmail.lastStatus);
  assertEquals_(0.5, notifyEmail.totalDistance);
  assertEquals_(1, notifyEmail.totalZaps);
  assertContains_("zapped", mailApp.testEmail.htmlBody);
  assertContains_("Joe Blow", mailApp.testEmail.subject);
  assertContains_("zapped", mailApp.testEmail.body);
  assertEquals_(2, mailApp.allEmails.length);
  assertEquals_(
    "Joe Blow zapped at 2:46:00 PM on 12/15/2021. Beep beep!\n\n" +
    "School year totals:\n\n" +
    "- 1 zaps\n" +
    "- 0.5 miles\n\n" +
    "24 more zaps until the next award.\n\n" +
    "Sincerely,\n" +
    "Zapster Bot\n\n" +
    "Zapsters is a self-powered commuting program from Reach Out Crest View. To change your notification preferences, reply to this email.",
    mailApp.testEmail.body);

  notifySms = sheetData.notifications.getRows()[1];
  assertEquals_(1, notifySms.attempts);
  assertEquals_("Complete", notifySms.lastStatus);

  assertEquals_(2, urlFetchApp.allRequests.length);
  assertEquals_(
    "https://api.twilio.com/2010-04-01/Accounts/AC1d604e9a9b984ebcae5a6eabeae2226c/Messages.json",
    urlFetchApp.testRequest.url);
  assertEquals_("+18584420289", urlFetchApp.testRequest.options.payload.To);
  assertEquals_(
    "Joe Blow zapped at 2:46:00 PM on 12/15/2021. That's 1 zaps and 0.5 miles this school year!",
    urlFetchApp.testRequest.options.payload.Body);

  console.info("zapProcessTest PASSED");
}

function zapPostTest() {
  integrationTestSetup();
  var request = {
    parameter: {
      StationId: REQUIRED_STATION_ID,
      bikeEventCount: "2",
      BikeDateTime0: "1645540855",
      RfidNum0: "00000000000000DE11111111",
      BikeDateTime1: "1645540855",
      RfidNum1: "00000000000000DE22222222",
      statusEventCount: "2",
      DateTime0: "1645542269",
      BatteryVoltage0: "12.40",
      SolarOutput0: "12.41",
      DateTime1: "1645542270",
      BatteryVoltage1: "12.42",
      SolarOutput1: "12.43"
    }
  };
  var response = JSON.parse(doPost(request).getContent());
  assertEquals_(2, response.newZap);
  assertEquals_(2, response.newStatus);

  var zap = sheetData.zaps.getRows()[2];
  assertEquals_(11111111, zap.tag);
  assertEquals_(1645540855000, zap.zapTime.getTime());
  zap = sheetData.zaps.getRows()[3];
  assertEquals_(22222222, zap.tag);
  assertEquals_(1645540855000, zap.zapTime.getTime());

  var status = sheetData.battery.getRows()[0];
  assertEquals_(1645542269000, status.statusTime.getTime());
  assertEquals_(12.40, status.battery);
  assertEquals_(12.41, status.solar);

  console.info("zapPostTest PASSED");
}

function unsubscribeTest() {
  integrationTestSetup();

  processTagNotices();

  var emailContact = sheetData.contacts.getRows()[0];
  assertEquals_("dretzlaff+mrblow@gmail.com", emailContact.contact);
  assertEquals_("", emailContact.unsubscribed);

  var request = {
    parameter: {
      action: "unsub",
      contact: emailContact.contact
    }
  };
  var response = doGet(request);
  assertContains_("<b>unsubscribed</b>", response.getContent());

  sheetData.contacts.data = null; // force reload
  emailContact = sheetData.contacts.getRows()[0];
  if (emailContact.unsubscribed == null) {
    throw Error("'unsubscribed' should NOT be null")
  }

  request.parameter.action = "sub";
  response = doGet(request);
  assertContains_("<b>subscribed</b>", response.getContent());

  sheetData.contacts.data = null; // force reload
  emailContact = sheetData.contacts.getRows()[0];
  assertEquals_("", emailContact.unsubscribed);

  console.info("unsubscribeTest PASSED");
}

///////////////////////////////////////// TESTS /////////////////////////////////////////

function unitTests() {
  testToPropertyNames_();
  testTrimTrailingEmpty_();
  testSplitToArray_();
}

function testToPropertyNames_() {
  assertEquals_("oneTwo", toPropertyName_("One two"));
  assertEquals_("three", toPropertyName_("Three"));
  assertEquals_("fourFiveSix", toPropertyName_("four FIVE Six"));
  assertEquals_("seven8", toPropertyName_("Seven&8"));
}

function testTrimTrailingEmpty_() {
  assertEquals_(
    ["one", "two", "three", "", "four"],
    trimTrailingEmpty_(["one", "two", "three", "", "four", "", ""]));
}

function testSplitToArray_(value) {
  assertEquals_(["one", "two"], splitToArray_("one, two"));
  assertEquals_(["three", "four"], splitToArray_("three\nfour"));
}

function assertEquals_(expected, actual) {
  expected = JSON.stringify(expected);
  actual = JSON.stringify(actual);
  if (expected != actual) {
    if (expected.includes("\\n")) {
      msg = `Expected:\n${expected}\n\nActual:\n${actual}`;
    } else {
      msg = `expected ${expected}, actual ${actual}`;
    }
    throw Error(msg);
  }
}

function assertContains_(needle, haystack) {
  if (!haystack.includes(needle)) {
    throw `Expected '${needle}' in: ${haystack}`;
  }
}
