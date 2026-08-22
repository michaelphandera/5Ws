"""Extract the 73 CEPS member organizations from the members-directory PDF
into seed/data/organizations.json."""
import json
import os
import re

from pypdf import PdfReader

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(HERE, '..', '..', 'CEPS-MEMBERS-DIRECTORY-FEBRUARY-2017_260816_173921.pdf')
OUT = os.path.join(HERE, 'data', 'organizations.json')

FIELD_NAMES = [
    'Name', 'Aim', 'Date Founded', 'Chairperson', 'E-mail Address',
    'Contact', 'Postal Address', 'Commission', 'Webpage',
]
FIELD_RE = re.compile(
    r'^\s*(' + '|'.join(re.escape(f) for f in FIELD_NAMES) + r')\s*:\s*(.*)$'
)


def clean(s):
    return re.sub(r'\s+', ' ', s).strip()


def parse(text):
    orgs = []
    current = None
    field = None
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if not line.strip() or set(line.strip()) <= {'_'}:
            field = None
            continue
        m = FIELD_RE.match(line)
        if m:
            key, value = m.group(1), m.group(2)
            if key == 'Name':
                if current:
                    orgs.append(current)
                current = {}
            if current is None:
                continue
            field = key
            current[key] = clean(value)
        elif current is not None and field:
            # continuation line of the previous field
            current[field] = clean(current[field] + ' ' + line)
    if current:
        orgs.append(current)
    return orgs


def to_record(o):
    name = o.get('Name', '')
    acronym = None
    m = re.match(r'^(.*?)\s*\(([^)]+)\)\s*$', name)
    if m:
        name, acronym = clean(m.group(1)), clean(m.group(2))
    emails = [clean(e) for e in re.split(r'[-,;/]\s+|\s+-\s+', o.get('E-mail Address', '')) if '@' in e]
    phones = [clean(p) for p in re.split(r'[-,;/]\s*', o.get('Contact', '')) if re.search(r'\d{5,}', p)]
    webpage = o.get('Webpage', '') or None
    return {
        'name': name,
        'acronym': acronym,
        'aim': o.get('Aim') or None,
        'dateFounded': o.get('Date Founded') or None,
        'chairperson': o.get('Chairperson') or None,
        'emails': emails,
        'phones': phones,
        'postalAddress': o.get('Postal Address') or None,
        'commission': o.get('Commission') or None,
        'webpage': webpage,
    }


def main():
    reader = PdfReader(PDF)
    text = '\n'.join((p.extract_text() or '') for p in reader.pages)
    orgs = [to_record(o) for o in parse(text) if o.get('Name')]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(orgs, f, indent=2, ensure_ascii=False)
    print(f'Extracted {len(orgs)} organizations -> {OUT}')
    missing_commission = [o['name'] for o in orgs if not o['commission']]
    print(f'{len(missing_commission)} orgs without a commission listed')


if __name__ == '__main__':
    main()
