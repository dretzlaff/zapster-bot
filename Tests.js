function allTests() {
  unitTests();
  welcomeTest();
  zapProcessTest();
  zapPostTest();
  unsubscribeTest();
  sendExceptionTest();
  createNewSheetDataTest();
  checkForRecentStatusTest()
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
    classCode: '1C',
    created: '12/14/2021'
  });
  sheetData.tags.append({
    tag: 987654321,
    studentName: 'Jane Blow',
    guardians: 'dretzlaff+mrblow@gmail.com',
    notify: 'dretzlaff+mrblow@gmail.com, 858-442-0289',
    distance: 1.5,
    classCode: '2P',
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

  // Still just two welcomes after another processing pass.
  processTagNotices();
  assertEquals_(2, sheetData.notifications.getRows().length);

  processNotifications();

  assertEquals_(
    "Hi, this is Zapster Bot from ROCV. I'm told you want to know when Joe Blow or Jane Blow zaps at " +
    "the Crest View bike racks. I'll keep an eye out for their tags (123456789 and 987654321) and be " +
    "in touch.\n\n" +
    "If you have questions or requests, you can respond to these emails and the Zapsters volunteer will " +
    "get back to you. Spam filtering can be a problem for me, so consider adding me to your contacts " +
    "(use my profile picture to see the add to contacts button?), marking this email as important, " +
    "and/or replying to teach your email provider you want these.\n\n" +
    "That’s it for now. I hope I can write you again soon. Thanks for supporting self-powered commuting!\n\n" +
    "Sincerely,\n" +
    "Zapster Bot\n\n" +
    "Zapsters is a self-powered commuting program from ReachOut Crest View. To change your notification " +
    "preferences, reply to this email.",
    mailApp.testEmail.body);

  assertEquals_(3, urlFetchApp.allRequests.length);
  assertEquals_(
    "Hi, this is Zapster Bot from ROCV. I’ll text you whenever Joe Blow or Jane Blow zaps at the Crest View bike racks. " +
    "I'm looking for tags 123456789 and 987654321.",
    urlFetchApp.allRequests[0].options.payload.Body);
  assertEquals_(
    "I always send from this number, so you might add it to your " +
    "contacts. Reply STOP if you’ve heard enough, or email " +
    "zapsters@rocv.org for anything else.",
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
    "Hi, this is Zapster Bot from ROCV. I got an update on your kid's tag situation. Now I’ll email you whenever Jane Blow " +
    "zaps at the Crest View bike racks. Specifically, I'm looking for tag 987654321.\n\n" +
    "If you have questions or requests, you can respond to these emails and the Zapsters volunteer will get back to you.\n\n" +
    "That’s it for now. I hope I can write you again soon. Thanks for supporting self-powered commuting!\n\n" +
    "Sincerely,\n" +
    "Zapster Bot\n\n" +
    "Zapsters is a self-powered commuting program from ReachOut Crest View. To change your notification preferences, reply " +
    "to this email.",
    mailApp.testEmail.body);

  assertEquals_(4, urlFetchApp.allRequests.length); // just one more; no STOP or thanks message.
  assertEquals_(
    "Hi! I got an update on your kid's tag situation. Now I’ll watch for tag 987654321 to see when Jane Blow " +
    "zaps at the Crest View bike racks.",
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

  processTagNotices();
  processZaps();
  processNotifications();
  SCRIPT_EXECUTION_TIME.setTime(SCRIPT_EXECUTION_TIME.getTime() + MIN_NOTIFY_RETRY_WAIT_MILLIS);

  notifyEmail = sheetData.notifications.getRows()[2];
  assertEquals_(1, notifyEmail.attempts);
  assertEquals_("Complete", notifyEmail.lastStatus);

  notifySms = sheetData.notifications.getRows()[3];
  assertEquals_(1, notifySms.attempts);
  if (!notifySms.lastStatus.includes("test exception")) {
    throw 'Expected "test exception", not: ' + notifySms.lastStatus;
  }

  // should not throw
  checkForStuckNotifications();

  // get them into a permanent failure.
  for (var i = 1; i <= 5; ++i) {
    processNotifications();
    SCRIPT_EXECUTION_TIME.setTime(SCRIPT_EXECUTION_TIME.getTime() + MIN_NOTIFY_RETRY_WAIT_MILLIS);
  }
  assertEquals_(5, notifySms.attempts);

  // no more attempts once we've reached MAX_NOTIFY_ATTEMPTS=5.
  processNotifications();
  assertEquals_(5, notifySms.attempts);

  try {
    checkForStuckNotifications();
    throw new Error("No exception thrown for stuck notification.")
  } catch (e) {
    assertContains_("3 stuck notifications", e.message);
    assertContains_("test exception", e.message);
  }
  SCRIPT_EXECUTION_TIME.setTime(SCRIPT_EXECUTION_TIME.getTime() + 24 * 3600 * 1000);
  checkForStuckNotifications(); // old stuck notification should be ignored

  console.info("sendExceptionTest PASS");
}

function zapProcessTest() {
  integrationTestSetup();

  processTagNotices();
  processZaps();

  // We should have 6 notifications: an HTML welcome, SMS welcome, (HTML zap, SMS zap) x2
  assertEquals_(6, sheetData.notifications.getRows().length);
  
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

  var notifyEmail = sheetData.notifications.getRows()[2];
  assertEquals_(joeZap.zapTime, notifyEmail.zapTime);
  assertEquals_(joeZap.studentName, "Joe Blow");
  assertEquals_("dretzlaff+mrblow@gmail.com", notifyEmail.contact);
  assertEquals_(123456789, notifyEmail.tags);
  assertEquals_("", notifyEmail.attempts);
  assertEquals_("", notifyEmail.lastAttempt);
  assertEquals_("", notifyEmail.lastStatus);

  var notifySms = sheetData.notifications.getRows()[3];
  assertEquals_("858-442-0289", notifySms.contact);

  processNotifications();

  notifyEmail = sheetData.notifications.getRows()[2];
  assertEquals_(1, notifyEmail.attempts);
  assertEquals_(SCRIPT_EXECUTION_TIME, notifyEmail.lastAttempt);
  assertEquals_("Complete", notifyEmail.lastStatus);
  assertEquals_(0.5, notifyEmail.totalDistance);
  assertEquals_(1, notifyEmail.totalZaps);
  assertContains_("zapped", mailApp.allEmails[1].htmlBody);
  assertContains_("Joe, ", mailApp.allEmails[1].subject);
  assertContains_("zapped", mailApp.allEmails[1].body);
  assertEquals_(3, mailApp.allEmails.length); // 2 zaps, 1 welcome
  assertEquals_(
    "Joe Blow zapped at 2:46:00 PM on 12/15/2021. Beep beep!\n\n" +
    "School year totals:\n\n" +
    "- 1 days\n" +
    "- 0.5 miles\n\n" +
    "24 more zaps until the next award.\n\n" +
    "Sincerely,\n" +
    "Zapster Bot\n\n" +
    "Zapsters is a self-powered commuting program from ReachOut Crest View. To change your notification preferences, reply to this email.",
    mailApp.allEmails[2].body);

  notifySms = sheetData.notifications.getRows()[3];
  assertEquals_(1, notifySms.attempts);
  assertEquals_("Complete", notifySms.lastStatus);

  assertEquals_(5, urlFetchApp.allRequests.length); // 2 zaps, 1 welcome of 3 msgs.
  assertEquals_(
    "https://api.twilio.com/2010-04-01/Accounts/AC1d604e9a9b984ebcae5a6eabeae2226c/Messages.json",
    urlFetchApp.testRequest.url);
  assertEquals_("+18584420289", urlFetchApp.testRequest.options.payload.To);
  assertEquals_(
    "Joe Blow zapped at 2:46:00 PM on 12/15/2021. That's 1 days and 0.5 miles this school year!",
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

function checkForRecentStatusTest() {
  integrationTestSetup();
  // No exception expected with no data, e.g. when processAll trigger
  // runs when new year starts.
  checkForRecentStatus();

  sheetData.battery.append({
    statusTime: SCRIPT_EXECUTION_TIME,
    battery: 12.1,
    solar: 12.2
  });

  // No exception expected with recent statusTime
  checkForRecentStatus();

  var oldMillis = SCRIPT_EXECUTION_TIME.getTime() - 2 * STALE_STATUS_ALERT_HOURS * 3600 * 1000;
  sheetData.battery.getRows()[0].statusTime = new Date(oldMillis);
  try {
    checkForRecentStatus();
    throw Error("No exception thrown for stale status test case");
  } catch (e) {
    assertContains_("16.0 hours ago", e.message)
  }
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
  assertEquals_(SCRIPT_EXECUTION_TIME, emailContact.unsubscribed);

  processNotifications();
  var emailNotification = sheetData.notifications.getRows()[0];
  assertEquals_("dretzlaff+mrblow@gmail.com", emailNotification.contact);
  assertEquals_("Unsubbed " + SCRIPT_EXECUTION_TIME, emailNotification.lastStatus);

  request.parameter.action = "sub";
  response = doGet(request);
  assertContains_("<b>subscribed</b>", response.getContent());

  sheetData.contacts.data = null; // force reload
  emailContact = sheetData.contacts.getRows()[0];
  assertEquals_("", emailContact.unsubscribed);

  console.info("unsubscribeTest PASSED");
}

function createNewSheetDataTest() {
  setupTest(new Date("2021-09-01"));
  var files = findSheetDataFilesForTest();
  if (!files[2020]) {
    throw Error("expected 2020 sheet to define structure")
  }
  if (files[2021]) {
    files[2021].setTrashed(true);
  }
  sheetData = openSheetData(new Date("2021-09-01"));
  files = findSheetDataFilesForTest();
  if (!files[2021]) {
    throw Error("expected 2021 sheet to be created")
  }

  ZAP_DATA_SHEET_NAMES.forEach(name => {
    var hasData = sheetData[name.toLowerCase()].getRows().length > 0;
    if (CARRY_FORWARD_SHEET_NAMES.includes(name)) {
      if (!hasData) {
        throw Error(name + " should have carry-forward data in its first row");
      }
    } else {
      if (hasData) {
        throw Error(name + " should NOT have carry-forward data in its first row");
      }
    }
  });
}

function greenGearCertificateTest() {
  integrationTestSetup();
  var files = findGreenGearFilesForTest();
  if (!files[2020]) {
    throw Error("expected 2020 sheet to define structure")
  }
  if (files[2021]) {
    files[2021].setTrashed(true);
  }
  sheetData.winners.append({
    date: '2022-03-07',
    prize: "Something Cool"
  });

  processZaps();
  processGreenGear();

  var presentation = openGreenGearPresentation(SCRIPT_EXECUTION_TIME);
  assertEquals_(2, presentation.getSlides().length);
  var slide = presentation.getSlides()[1];
  var allText = "";
  slide.getShapes().forEach(shape => {
    allText += shape.getText().asString();
  });
  assertContains_("Joe Blow", allText);
  assertContains_("March 7, 2022", allText);
  assertContains_("Something Cool", allText);
  assertContains_("1st Grade", allText);

  console.info("testEmail =\n" + JSON.stringify(mailApp.testEmail));
  assertEquals_("Zapsters winner for March 7, 2022", mailApp.testEmail.subject);
  assertContains_("Joe Blow is the Green Gear winner for the week of March 7, 2022.", mailApp.testEmail.body);
  assertContains_("They are in 1st grade and have 1 zaps and 0.5 miles this school year.", mailApp.testEmail.body);
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
