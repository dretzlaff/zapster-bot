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
  sheetData = openSheetData_(PROD_ZAP_DATA_FOLDER_ID, new Date());
}
function setupTest(date) {
  // leave mailApp and urlFetchApp null
  sheetData = openSheetData_(TEST_ZAP_DATA_FOLDER_ID, date);
  ZAP_DATA_SHEET_NAMES.forEach(name => {
    var sheet = sheetData[name.toLowerCase()].sheet;
    if (sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
    }
  });
}

function openSheetData_(folderId, date) {
  var folder = DriveApp.getFolderById(folderId);
  var files = {};
  var fileIter = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (fileIter.hasNext()) {
    var file = fileIter.next();
    var year = file.getName().match(/Zap Data \b(\d{4})\b/i);
    if (year) {
      files[parseInt(year[1])] = file;
    }
  }

  var year = parseInt(Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy"));
  var month = parseInt(Utilities.formatDate(date, Session.getScriptTimeZone(), "MM"));
  if (month < 7) {
    year -= 1;
  }

  var spreadsheet;
  if (year in files) {
    spreadsheet = SpreadsheetApp.open(files[year]);
  } else {
    var sourceToCopy = files[year-1];
    if (!sourceToCopy) {
      throw Error("cannot find year " + (year-1) + " to initialize year " + year);
    }
    console.info("Creating spreadsheet for " + year);
    var newName = sourceToCopy.getName().replace(/\b\d{4}\b.+/, year + "-" + (year+1));
    var file = sourceToCopy.makeCopy(newName, folder);
    spreadsheet = SpreadsheetApp.open(file);
    spreadsheet.getSheets()
      // carry forward tag and contact information, truncating the rest
      .filter(sheet => !CARRY_FORWARD_SHEET_NAMES.includes(sheet.getName()))
      .filter(sheet => sheet.getLastRow() > 1)
      .forEach(sheet => sheet.deleteRows(2, sheet.getLastRow() - 1));
  }
  var sheets = {};
  ZAP_DATA_SHEET_NAMES.forEach(name => {
    sheets[name.toLowerCase()] = new SheetData_(spreadsheet, name);
  });
  return sheets;
}