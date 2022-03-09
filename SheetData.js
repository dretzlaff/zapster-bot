// Class that exposes a sheet as objects whose property names come from
// column headers.
class SheetData_ {
  constructor(spreadsheet, sheetName) {
    this.loaded = false;

    var sheets = spreadsheet.getSheets().filter(s => s.getName() == sheetName);
    if (sheets.length == 0) {
      throw Error(`No sheet name '${sheetName}'`);
    }
    this.sheet = sheets[0];

    // Use header row for property names, ignoring empty, trailing columns.
    var headerValues = this.sheet.getSheetValues(1, 1, 1, -1)[0];
    this.propertyNames = trimTrailingEmpty_(headerValues.map(toPropertyName_));
  }
}

SheetData_.prototype.getRows = function() {
  if (!this.data) {
    this.loadRows();
  }
  return this.data;
}

SheetData_.prototype.loadRows = function() {
  var timerName = `Loading ${this.sheet.getName()} sheet`;
  console.time(timerName);
  var thisSheet = this.sheet;
  var values = 
    this.sheet.getLastRow() == 1 ? [] :
      this.sheet.getSheetValues(2, 1, -1, this.propertyNames.length);
  this.data = values.map((colValues, rowIdx) => {
    const obj = {};
    this.propertyNames.forEach((propertyName, propertyIdx) => {
      Object.defineProperty(obj, propertyName, {
        get() { return colValues[propertyIdx] },
        set(value) {
          colValues[propertyIdx] = value;
          // Add 1 to row and column for zero-based index to one-based index
          // Also add 1 to row since the header row isn't in "values"
          thisSheet.getRange(rowIdx + 2, propertyIdx + 1).setValue(value);
        },
        enumerable: true
      });
    });
    // Make sure setting properties without a corresponding column
    // fails with an exception.
    Object.freeze(obj);
    return obj;
  });
  console.timeEnd(timerName);
}

SheetData_.prototype.withLookup = function(getKey) {
  var rows = {};
  this.forEach(row => {
    var key = getKey(row);
    rows[key] = row;
  });
  return rows;
}

SheetData_.prototype.append = function(obj) {
  var rowContents = this.propertyNames.map(n => null);
  for (var property in obj) {
    // ignore inherited properties
    if (!obj.hasOwnProperty(property)) {
      continue;
    }
    var columnIdx = this.propertyNames.indexOf(property);
    if (columnIdx < 0) {
      throw Error(`Property '${property}' not found in ${JSON.stringify(this.propertyNames)}`);
    }
    rowContents[columnIdx] = obj[property];
  }
  this.sheet.appendRow(rowContents);
  this.data = null;
}

// Convenience functions so SheetData feels like an array.

SheetData_.prototype.filter = function(f) {
  return this.getRows().filter(f);
}
SheetData_.prototype.forEach = function(f) {
  return this.getRows().forEach(f);
}
SheetData_.prototype.find = function(f) {
  return this.getRows().find(f);
}
SheetData_.prototype.map = function(f) {
  return this.getRows().map(f);
}

function toPropertyName_(value) {
  return value
      .toLowerCase()
      .replaceAll(/\W+/g, " ")
      .replaceAll(/ +(\w)/g, (match, p1) => p1.toUpperCase());
}

function trimTrailingEmpty_(values) {
  while (values.length > 0 && values[values.length - 1] == "") {
    values.pop();
  }
  return values;
}
