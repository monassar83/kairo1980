#!/usr/bin/env python3
"""Generate zones.js from the delivery-zone spreadsheet.

The spreadsheet at data/delivery_zones.xlsx is the single source of truth for
the delivery area. It is the same table used for the Lieferando zones, it is
easy to edit, and it is the file the business already maintains. This script
compiles it into zones.js, which the website loads.

    python tools/build-zones.py

Never edit zones.js by hand — the next run overwrites it. Edit the spreadsheet
and re-run. The script refuses to write a broken file: duplicate postcodes,
malformed postcodes and non-numeric prices are reported as errors.

Expected columns (header row, any order, extra columns ignored):
    PLZ | City | Distance | Minimum Value | Delivery Fee
"""

import io
import os
import re
import sys
from datetime import date

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required:  python -m pip install openpyxl")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'data', 'delivery_zones.xlsx')
TARGET = os.path.join(ROOT, 'zones.js')

WANTED = {
    'plz': 'plz',
    'city': 'city',
    'distance': 'km',
    'minimum value': 'min_order',
    'delivery fee': 'fee',
}


def number(value, field, row_no, errors, required=True):
    if value is None or str(value).strip() == '':
        if required:
            errors.append('row %d: %s is empty' % (row_no, field))
        return None
    try:
        num = float(str(value).replace(',', '.'))
    except ValueError:
        errors.append('row %d: %s is not a number (%r)' % (row_no, field, value))
        return None
    return int(num) if num == int(num) else num


def read_rows():
    sheet = openpyxl.load_workbook(SOURCE, data_only=True).worksheets[0]
    rows = sheet.iter_rows(values_only=True)

    header = next(rows)
    index = {}
    for position, label in enumerate(header):
        key = WANTED.get(str(label or '').strip().lower())
        if key:
            index[key] = position

    missing = {'plz', 'city', 'min_order', 'fee'} - set(index)
    if missing:
        sys.exit('spreadsheet is missing column(s): %s' % ', '.join(sorted(missing)))

    zones, errors, seen = [], [], {}

    for offset, row in enumerate(rows, start=2):
        if not any(cell is not None and str(cell).strip() for cell in row):
            continue

        plz = re.sub(r'\D', '', str(row[index['plz']] or ''))
        city = str(row[index['city']] or '').strip()

        if len(plz) != 5:
            errors.append('row %d: %r is not a 5-digit postcode' % (offset, row[index['plz']]))
            continue
        if not city:
            errors.append('row %d: city is empty' % offset)
        if plz in seen:
            errors.append(
                'row %d: postcode %s is already used in row %d (%s vs %s) — '
                'one postcode can only have one price'
                % (offset, plz, seen[plz][0], seen[plz][1], city))
            continue
        seen[plz] = (offset, city)

        zones.append({
            'plz': plz,
            'city': city,
            'km': number(row[index['km']], 'distance', offset, [], required=False)
                  if 'km' in index else None,
            'min_order': number(row[index['min_order']], 'minimum value', offset, errors),
            'fee': number(row[index['fee']], 'delivery fee', offset, errors),
        })

    return zones, errors


def main():
    if not os.path.exists(SOURCE):
        sys.exit('missing source spreadsheet: %s' % SOURCE)

    zones, errors = read_rows()

    if errors:
        print('zones.js NOT written — fix the spreadsheet first:\n', file=sys.stderr)
        for problem in errors:
            print('  * %s' % problem, file=sys.stderr)
        sys.exit(1)

    zones.sort(key=lambda z: (z['km'] is None, z['km'] if z['km'] is not None else 0, z['plz']))

    width = max(len(z['city']) for z in zones) + 2
    lines = []
    for zone in zones:
        lines.append("  ['%s', %-*s %5s, %3s, %s]," % (
            zone['plz'], width, "'" + zone['city'] + "',",
            'null' if zone['km'] is None else zone['km'],
            zone['min_order'], zone['fee']))
    lines[-1] = lines[-1].rstrip(',')

    body = (
        '/* AUTO-GENERATED — DO NOT EDIT.\n'
        '   Source : data/delivery_zones.xlsx\n'
        '   Rebuild: python tools/build-zones.py\n'
        '   Written: %s · %d postcodes\n'
        '\n'
        '   Edit the spreadsheet, re-run the command, commit both files.\n'
        '   Columns: [ postcode, place, km, minimum order EUR, delivery fee EUR ]\n'
        '*/\n'
        'window.KAIRO_ZONES = [\n%s\n];\n'
    ) % (date.today().isoformat(), len(zones), '\n'.join(lines))

    io.open(TARGET, 'w', encoding='utf-8', newline='\n').write(body)
    print('zones.js written — %d postcodes, %s'
          % (len(zones), 'up to %.1f km' % max(z['km'] for z in zones if z['km'] is not None)))


if __name__ == '__main__':
    main()
