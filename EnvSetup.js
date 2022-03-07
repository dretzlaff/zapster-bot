const SCRIPT_EXECUTION_TIME = new Date();

const MAX_NOTIFY_ATTEMPTS = 5;
const MIN_NOTIFY_RETRY_WAIT_MILLIS = 10 * 60000; // 10 minutes
const LOCK_WAIT_MILLIS = 10000; // 10 seconds
const STALE_STATUS_ALERT_HOURS = 8;

const ZAP_DATA_SHEET_NAMES = ["Zaps", "Tags", "Contacts", "Notifications", "Battery", "Winners"];
const CARRY_FORWARD_SHEET_NAMES = ["Tags", "Contacts"];

// variables that take different values for prod vs test
var mailApp = null;
var urlFetchApp = null;
var sheetData = null;
var envFolderId = null;

function setupProd() {
  if (mailApp != null || urlFetchApp != null || sheetData != null) {
    return; // never overwrite test with prod
  }
  envFolderId = PROD_ZAP_DATA_FOLDER_ID;
  mailApp = MailApp;
  urlFetchApp = UrlFetchApp;
  sheetData = openSheetData(SCRIPT_EXECUTION_TIME);
}
function setupTest(date) {
  envFolderId = TEST_ZAP_DATA_FOLDER_ID;
  // leave mailApp and urlFetchApp null
  sheetData = openSheetData(date);
  ZAP_DATA_SHEET_NAMES
    .map(name => sheetData[name.toLowerCase()].sheet)
    .forEach(truncateSheet_);
}

function findSheetDataFilesForTest() {
  return findFiles_("Zap Data", MimeType.GOOGLE_SHEETS);
}

function findGreenGearFilesForTest() {
  return findFiles_("Green Gear Certificates", MimeType.GOOGLE_SLIDES);
}

function findFiles_(prefix, mimeType) {
  var files = {};
  var fileIter = DriveApp.getFolderById(envFolderId).getFilesByType(mimeType);
  var re = new RegExp(prefix + " \\b(\\d{4})\\b", "i");
  while (fileIter.hasNext()) {
    var file = fileIter.next();
    var year = file.getName().match(re);
    if (year) {
      files[parseInt(year[1])] = file;
    }
  }
  return files;
}

function findOrCreateFile_(date, prefix, mimeType, onCreate) {
  var files = findFiles_(prefix, mimeType);

  var year = date.getFullYear();
  if (date.getMonth() < 6) { // 0=Jan so 6=July
    year -= 1;
  }

  if (year in files) {
    return files[year];
  }
  var sourceToCopy = files[year-1];
  if (!sourceToCopy) {
    throw Error("cannot find year " + (year-1) + " to initialize " + year);
  }
  var newName = sourceToCopy.getName().replace(/\b\d{4}\b.+/, year + "-" + (year+1));
  console.info(`Creating ${newName}`);
  var newFile = sourceToCopy.makeCopy(newName, DriveApp.getFolderById(envFolderId));
  onCreate(newFile); // let the new year's file be cleared appropriately
  return newFile;
}

function openSheetData(date) {
  var file = findOrCreateFile_(date, "Zap Data", MimeType.GOOGLE_SHEETS, onCreateSheetData_);
  var spreadsheet = SpreadsheetApp.open(file);
  var sheets = {};
  ZAP_DATA_SHEET_NAMES.forEach(name => {
    sheets[name.toLowerCase()] = new SheetData_(spreadsheet, name);
  });
  return sheets;
}

function onCreateSheetData_(file) {
  SpreadsheetApp.open(file)
      .getSheets()
      .filter(sheet => !CARRY_FORWARD_SHEET_NAMES.includes(sheet.getName()))
      .forEach(truncateSheet_);
}

function truncateSheet_(sheet) {
  // Deleting can run throw "Sorry, it is not possible to delete all non-frozen rows" if
  // the sheet's rows are all gone. So we add an empty row, then delete all rows after it.
  sheet.insertRowBefore(2);
  if (sheet.getLastRow() > 2) {
    var howMany = sheet.getLastRow() - 2;
    sheet.deleteRows(3, howMany);
  }
}

function onCreateGreenGearPresentation_(file) {
  var p = SlidesApp.openById(file.getId());
  for (var i = p.getSlides().length - 1; i > 0; --i) {
    p.getSlides()[i].remove();
  }
}

function openGreenGearPresentation(date) {
  var file = findOrCreateFile_(date, "Green Gear Certificates", MimeType.GOOGLE_SLIDES, onCreateGreenGearPresentation_);
  return SlidesApp.openById(file.getId());
}
