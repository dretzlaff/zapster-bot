const SCRIPT_EXECUTION_TIME = new Date();

const MAX_NOTIFY_ATTEMPTS = 5;
const MIN_NOTIFY_RETRY_WAIT_MILLIS = 10 * 60000; // 10 minutes
const LOCK_WAIT_MILLIS = 10000; // 10 seconds
const STALE_STATUS_ALERT_HOURS = 8;

const ZAP_DATA_SHEET_NAMES = ["Zaps", "Tags", "Contacts", "Notifications", "Battery"];
const CARRY_FORWARD_SHEET_NAMES = ["Tags", "Contacts"];

// variables that take different values for prod vs test
var mailApp = null;
var urlFetchApp = null;
var sheetData = null;

function setupProd() {
  if (mailApp != null || urlFetchApp != null || sheetData != null) {
    return; // never overwrite test with prod
  }
  mailApp = MailApp;
  urlFetchApp = UrlFetchApp;
  sheetData = openSheetData(PROD_ZAP_DATA_FOLDER_ID, SCRIPT_EXECUTION_TIME);
}
function setupTest(date) {
  // leave mailApp and urlFetchApp null
  sheetData = openSheetData(TEST_ZAP_DATA_FOLDER_ID, date);
  ZAP_DATA_SHEET_NAMES
    .map(name => sheetData[name.toLowerCase()].sheet)
    .forEach(truncateSheet_);
}

function findZapDataFiles(folderId) {
  var files = {};
  var fileIter = DriveApp.getFolderById(folderId).getFilesByType(MimeType.GOOGLE_SHEETS);
  while (fileIter.hasNext()) {
    var file = fileIter.next();
    var year = file.getName().match(/Zap Data \b(\d{4})\b/i);
    if (year) {
      files[parseInt(year[1])] = file;
    }
  }
  return files;
}

function openSheetData(folderId, date) {
  var files = findZapDataFiles(folderId);

  var year = date.getFullYear();
  if (date.getMonth() < 6) { // 0=Jan so 6=July
    year -= 1;
  }

  var spreadsheet;
  if (year in files) {
    spreadsheet = SpreadsheetApp.open(files[year]);
    spreadsheet.del
  } else {
    var sourceToCopy = files[year-1];
    if (!sourceToCopy) {
      throw Error("cannot find year " + (year-1) + " to initialize year " + year);
    }
    console.info("Creating spreadsheet for " + year);
    var newName = sourceToCopy.getName().replace(/\b\d{4}\b.+/, year + "-" + (year+1));
    var file = sourceToCopy.makeCopy(newName, DriveApp.getFolderById(folderId));
    spreadsheet = SpreadsheetApp.open(file);
    spreadsheet.getSheets()
      // carry forward tag and contact information, truncating the rest
      .filter(sheet => !CARRY_FORWARD_SHEET_NAMES.includes(sheet.getName()))
      .forEach(truncateSheet_);
  }
  var sheets = {};
  ZAP_DATA_SHEET_NAMES.forEach(name => {
    sheets[name.toLowerCase()] = new SheetData_(spreadsheet, name);
  });
  return sheets;
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
