const XLSX = require('xlsx');

// Each known field maps to a list of acceptable header names (normalized: lowercase, letters/numbers
// only), listed in priority order — if a file has more than one header that could match a field
// (e.g. both "Date Time Completed" and "Date Time Created"), the earlier alias wins regardless of
// which column comes first in the sheet.
const FIELD_ALIASES = {
  customer_first_name: ['customerfirstname', 'firstname', 'first', 'fname'],
  customer_last_name: ['customerlastname', 'lastname', 'last', 'lname'],
  job_id: ['dispatchid', 'jobid', 'job', 'jobnumber', 'jobno', 'jobref'],
  star_rating: ['fivestarrating', 'starrating', 'rating', 'stars', 'score', 'reviewrating'],
  tech_name: ['techname', 'technician', 'tech', 'technicianname', 'employee', 'employeename'],
  address: ['address', 'customeraddress', 'serviceaddress', 'jobaddress', 'streetaddress'],
  contact: ['mobile', 'mobilenumber', 'mobilephone', 'cellphone', 'cell', 'phone', 'phonenumber', 'contact', 'contactinfo', 'customercontact'],
  review_text: ['fivestarcomment', 'comments', 'review', 'feedback', 'notes', 'comment', 'reviewtext'],
  review_date: ['datetimecompleted', 'completeddate', 'completiondate', 'servicedate', 'jobdate', 'datetimecreated', 'date', 'reviewdate'],
  vendor_name: ['vendorname', 'vendor', 'branch', 'company'],
  vendor_id: ['vendorid', 'branchid'],
};

// Address/contact components that get folded into the `address`/`contact` fields alongside their
// primary column (e.g. a separate "City" column combines with "Address" rather than becoming its
// own unmapped extra field).
const ADDRESS_COMPONENT_ALIASES = { city: ['city'], state: ['state'], zip: ['zip', 'zipcode', 'postalcode'] };
const CONTACT_COMPONENT_ALIASES = { email: ['email', 'emailaddress'] };

function normalizeHeader(header) {
  return String(header || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pickHeader(headers, usedHeaders, aliases) {
  for (const alias of aliases) {
    const header = headers.find((h) => !usedHeaders.has(h) && normalizeHeader(h) === alias);
    if (header) return header;
  }
  return undefined;
}

function buildHeaderMap(headers) {
  const map = {}; // field -> original header
  const usedHeaders = new Set();

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const header = pickHeader(headers, usedHeaders, aliases);
    if (header) {
      map[field] = header;
      usedHeaders.add(header);
    }
  }

  const componentMap = {}; // component name -> original header
  for (const [component, aliases] of Object.entries({ ...ADDRESS_COMPONENT_ALIASES, ...CONTACT_COMPONENT_ALIASES })) {
    const header = pickHeader(headers, usedHeaders, aliases);
    if (header) {
      componentMap[component] = header;
      usedHeaders.add(header);
    }
  }

  const extraHeaders = headers.filter((h) => !usedHeaders.has(h));
  return { map, componentMap, extraHeaders };
}

function excelSerialToDate(serial) {
  // Excel's epoch: Dec 30, 1899
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
}

// All dates are handled as UTC-anchored (no timezone) throughout, since spreadsheet dates
// carry no timezone of their own — mixing UTC-based parsing with local-time formatting would
// shift dates by a day for anyone west of UTC.
function parseDateValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !isNaN(value)) return value;
  if (typeof value === 'number') {
    const d = excelSerialToDate(value);
    return isNaN(d) ? null : d;
  }

  const str = String(value).trim();

  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return isNaN(date) ? null : date;
  }

  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return isNaN(date) ? null : date;
  }

  const parsed = new Date(str);
  if (isNaN(parsed)) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

function toIsoDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseRating(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(String(value).replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return null;
  return Math.max(0, Math.min(5, Math.round(num)));
}

function cell(record, header) {
  if (header === undefined) return undefined;
  const value = record[header];
  return value === '' || value === undefined ? undefined : String(value).trim();
}

/** Finds the sheet to import: one literally named "Data" (case-insensitive), since these workbooks
 * also carry pivot-table analytics sheets (e.g. "Summary By Tech") that must not be imported as rows. */
function findDataSheet(workbook) {
  const name = workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'data');
  return name || null;
}

/**
 * Parses an uploaded Excel/CSV file buffer into normalized review rows.
 * Rows missing a usable date fall back to `fallbackDate`.
 * Returns { rows, errors, headers } where each row is ready for DB insertion.
 */
function parseReviewWorkbook(buffer, fallbackDate) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  let sheetName = findDataSheet(workbook);
  if (!sheetName) {
    if (workbook.SheetNames.length === 1) {
      sheetName = workbook.SheetNames[0];
    } else {
      return {
        rows: [],
        errors: [`This file has multiple sheets (${workbook.SheetNames.join(', ')}) but none is named "Data". Rename the sheet with your review rows to "Data" and re-upload.`],
        headers: [],
      };
    }
  }

  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (raw.length === 0) {
    return { rows: [], errors: ['The "Data" sheet has no data rows.'], headers: [] };
  }

  const headers = Object.keys(raw[0]);
  const { map, componentMap, extraHeaders } = buildHeaderMap(headers);

  // fallbackDate is "now" in local server time; anchor it to that same calendar day in UTC
  // so it stays consistent with how dates parsed from the spreadsheet are represented.
  const normalizedFallback = new Date(Date.UTC(fallbackDate.getFullYear(), fallbackDate.getMonth(), fallbackDate.getDate()));

  const rows = [];

  raw.forEach((record, index) => {
    const rowNum = index + 2; // account for header row, 1-indexed
    const get = (field) => cell(record, map[field]);
    const getComponent = (name) => cell(record, componentMap[name]);

    const hasAnyData = Object.values(record).some((v) => v !== '' && v !== undefined);
    if (!hasAnyData) return; // skip fully blank row

    const dateValue = parseDateValue(get('review_date')) || normalizedFallback;
    const rating = parseRating(get('star_rating'));

    const address = [get('address'), [getComponent('city'), [getComponent('state'), getComponent('zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(', ');
    const contact = [get('contact'), getComponent('email')].filter(Boolean).join(' · ');

    const extra = {};
    for (const h of extraHeaders) {
      if (record[h] !== '' && record[h] !== undefined) extra[h] = record[h];
    }

    rows.push({
      customer_first_name: get('customer_first_name') ?? '',
      customer_last_name: get('customer_last_name') ?? '',
      job_id: get('job_id') ?? '',
      star_rating: rating,
      // Uppercased so a source file's inconsistent capitalization (e.g. "cody" vs "CODY") never
      // fragments a technician's reviews into two separate entries in filters and analytics.
      tech_name: (get('tech_name') ?? '').toUpperCase(),
      address,
      contact,
      review_text: get('review_text') ?? '',
      review_date: toIsoDate(dateValue),
      review_year: dateValue.getUTCFullYear(),
      review_month: dateValue.getUTCMonth() + 1,
      vendor_name: get('vendor_name') ?? '',
      vendor_id: get('vendor_id') ?? '',
      extra_data: Object.keys(extra).length ? JSON.stringify(extra) : null,
      _rowNum: rowNum,
    });
  });

  return { rows, errors: [], sheetName, headers, mappedFields: Object.keys(map), unmappedHeaders: extraHeaders };
}

module.exports = { parseReviewWorkbook };
