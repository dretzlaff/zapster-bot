// variables that take different values for prod vs test
var mailApp = null;
var urlFetchApp = null;
var sheetData = null;

function setupTestSheetData() {
  var file = getZapDataFiles_()["Test"];
  setSheetData_(openAndTruncate_(file));
}

function setupProd() {
  // Allow test setup to take priority.
  if (mailApp != null | urlFetchApp != null || sheetData != null) {
    return;
  }
  mailApp = MailApp;
  urlFetchApp = UrlFetchApp;

  var year = parseInt(Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy"));
  var month = parseInt(Utilities.formatDate(date, Session.getScriptTimeZone(), "MM"));
  if (month < 7) {
    year -= 1;
  }

  var files = getZapDataFiles_();
  var file = files[year.toString()];
  if (file) {
    setSheetData(SpreadsheetApp.open(file));
  } else {
    var sourceToCopy = files[(year-1).toString()];
    if (!sourceToCopy) {
      sourceToCopy = files["Test"];
    }
    if (!sourceToCopy) {
      throw Error("Cannot find a zap data spreadsheet in " + ZAP_DATA_FOLDER_ID);
    }
    // Copy the source and delete all tabs' rows except their headers.
    var newFileName = year + " Zap Data";
    file = sourceToCopy.makeCopy(newName, zapDataFolder);
    setSheetData_(openAndTruncate_(file));
  }
}

function openAndTruncate_(file) {
  var spreadsheet = SpreadsheetApp.open(file);
  spreadsheet.getSheets()
    .filter(sheet => sheet.getLastRow() > 1)
    .forEach(sheet => sheet.deleteRows(2, sheet.getLastRow() - 1));
  return spreadsheet;
}

function getZapDataFiles_() {
  var fileIter = ZAP_DATA_FOLDER.getFilesByType(MimeType.GOOGLE_SHEETS);
  var files = {};
  while (fileIter.hasNext()) {
    var file = fileIter.next();
    var firstWord = file.getName().match(/^\w+/)[0];
    files[firstWord] = file;
  }
  return files;
}

function setSheetData_(spreadsheet) {
  sheetData = {
    zaps: new SheetData_(spreadsheet, "Zaps"),
    tags: new SheetData_(spreadsheet, "Tags"),
    contacts: new SheetData_(spreadsheet, "Contacts"),
    notifications: new SheetData_(spreadsheet, "Notifications"),
    battery: new SheetData_(spreadsheet, "Battery")
  }
}
