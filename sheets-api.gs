function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tracked');
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return ContentService.createTextOutput(JSON.stringify({}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const result = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const key = row[0];
    if (!key) continue;
    result[key] = {
      interested: row[1] === true || row[1] === 'TRUE',
      applied: row[2] === true || row[2] === 'TRUE',
      trackedAt: row[3] || ''
    };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('tracked');
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Sheet not found' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const data = JSON.parse(e.postData.contents);
  sheet.clearContents();
  sheet.appendRow(['key', 'interested', 'applied', 'trackedAt']);
  Object.keys(data).forEach(key => {
    const entry = data[key];
    sheet.appendRow([key, !!entry.interested, !!entry.applied, entry.trackedAt || '']);
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
