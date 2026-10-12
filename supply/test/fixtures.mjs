// Synthetic source files with the same layout as Todd's real Ginsberg's files.
// Every value here is made up for testing (item numbers, prices, names, contacts).
// The real files stay in Todd's Drive and are never copied into this public repository.

export const WEEKLY_ID = 'TESTweeklySheet000000000001';
export const MASTER_ID = 'TESTmasterSheet000000000001';
export const DELETED_ID = 'TESTdeletedCsv0000000000001';
export const GRAPH_ID = 'TESTgraphCsv000000000000001';
export const REF_ID = 'TESTreferenceTxt00000000001';

const weeklyTab = [
  [],
  ['Ginsbergs weekly ordering'],
  ['Count date:'],
  ['Yellow cells: enter stock...'],
  [], [], [],
  ['Category', 'Item', 'Item #', 'Case pack', 'On hand (cases)', 'Incoming (cases)', 'Minimum (cases)', 'Target (cases)', 'Suggested order (cases)', 'Supplier status', 'Notes'],
  ['Paper / serving supplies', 'TEST Toilet tissue', '90001', '96 x CT', '', '', '', '', '', 'Listed in Oct 9 guide'],
  ['Paper / serving supplies', 'TEST CUP HOT 12OZ', '90002', '20 x 50 CT', '', '', '', '', '', 'Listed in Oct 9 guide'],
  ['Frozen food', 'TEST Soup red lentil', '90003', '4 x 4#', '', '', '', '', '', 'Listed in Oct 9 guide'],
  ['Frozen food', 'TEST *D*SOUP OLD', '90004', '4 x 4#', '', '', '', '', 'Check supplier', 'Suspended'],
  ['Dry food', 'TEST Sugar packets', '00412', '1 x 2000 CT', '', '', '', '', '', 'Listed in Oct 9 guide', 'Listed in history with zero cases.'],
];
const purchaseTab = [
  [],
  ['Purchase reference'],
  ['Season quantities are invoice-listed shipped cases...'],
  [], [], [], [],
  ['Category', 'Item #', 'Item', 'Case pack', '2023/24 cases', '2025/26 cases', '2020-2026 cases', 'Oct 9 case price', 'Supplier status', 'Use'],
  ['Paper / serving supplies', '90001', 'TEST Toilet tissue', '96 x CT', '8.', '14.', '87.', '$11.11', 'Listed in Oct 9 guide', 'On weekly checklist'],
  ['Paper / serving supplies', '90002', 'TEST CUP HOT 12OZ', '20 x 50 CT', '2.', '1.', '7.', '$22.22', 'Listed in Oct 9 guide', 'On weekly checklist'],
  ['Frozen food', '90003', 'TEST Soup red lentil', '4 x 4#', '7.', '13.', '74.', '$33.33', 'Listed in Oct 9 guide', 'On weekly checklist'],
  ['Frozen food', '90004', 'TEST *D*SOUP OLD', '4 x 4#', '0.', '0.', '3.', '', 'Suspended', 'On weekly checklist'],
  ['Dry food', '00412', 'TEST Sugar packets', '1 x 2000 CT', '0.', '1.', '5.', '$4.44', 'Listed in Oct 9 guide', 'On weekly checklist'],
];
const priceTab = [
  [],
  ['Ginsbergs price comparison'],
  ["This year's prices: supplier guide dated October 9, 2026. Earlier prices: ..."],
  [], [], [], [],
  ['Category', 'Item', 'Item #', 'Case pack', '2023/24 last price', '2023/24 price date', '2025/26 last price', '2025/26 price date', '2026/27 guide price', '$ change vs 25/26', '% change vs 25/26', '$ change vs 23/24', '% change vs 23/24', 'Comparison notes'],
  ['Paper / serving supplies', 'TEST Toilet tissue', '90001', '96 x CT', '$10.00', '2024-02-15', '$11.00', '2026-08-27', '$11.11', '', '', '', ''],
  ['Guide only', 'TEST GUIDE ONLY APPLES', '90005', '1 x 12 CT', '', '', '', '', '$5.55', '', '', '', '', 'No saved invoice price in either season.'],
];
const masterList = [
  ['Master List Ginsbergs ordering master list'],
  ['115 form entries...'],
  [],
  ['Category', 'Kathy item', 'Old item #', 'Status', 'Guide item #', 'Guide description', 'Guide case pack', 'Oct 9 case price', 'Candidate #', 'Candidate description', 'Candidate case pack', 'Candidate case price', 'Historical cases', 'Issue / next step', 'Selected item #', 'Decision notes'],
  ['Soups', 'TEST Old soup', '90004', 'Suspended - choose replacement', '', '', '', '', '90003', 'TEST SOUP RED LENTIL', '4 x 4#', '$33.33', '3.', 'Supplier lists this item as suspended. Replacement has not been confirmed.', '', ''],
  ['Hot Beverages', 'TEST Teas', '', 'Identify item', '', '', '', '', '', '', '', '', '', 'Kathy supplied no item number. Confirm brand and specification.', '', ''],
];
const masterGuide = [
  ['Current Guide "Supplier guide dated October 9, 2026"'],
  ['173 items transcribed...'],
  ['Item #', 'Brand', 'Supplier description', 'Pack', 'Size per pack', 'Case price', 'PDF page'],
  ['90001', 'TESTBRAND', 'TISSUE TOILET 2PLY TEST', '96', 'CT', '$11.11', '1'],
  ['90002', 'TESTCUPS', 'CUP HOT 12OZ PAPER TEST', '20', '50 CT', '$22.22', '3'],
];

export const DRIVE_FILES = {
  [WEEKLY_ID]: { tabs: [{ name: 'Weekly Order', values: weeklyTab }, { name: 'Purchase Reference', values: purchaseTab }, { name: 'Price Comparison', values: priceTab }] },
  [MASTER_ID]: { tabs: [{ name: 'Master List', values: masterList }, { name: 'Current Guide', values: masterGuide }] },
  [DELETED_ID]: { text: '"Item","","Brand","Pack","Size","Description"\n"-","Problem : Restricted (Count = 1)","","","",""\n"","90006","TESTCHEM","4","1 GAL","*D*TEST DETERGENT"\n"-","Problem : Suspended (Count = 1)","","","",""\n"","90004","TESTSOUP","4","4#","*D*TEST SOUP OLD"\n"","","","","","Total = 2"\n' },
  [GRAPH_ID]: { text: 'item,description,2023/24 invoiced cases,2025/26 invoiced cases,historical cases,historical sales\n90001,TISSUE TOILET 2PLY TEST,8.0,14.0,87,999.99\n00412,SUGAR PACKETS TEST,0,1.0,5,12.34\n' },
  [REF_ID]: { text: "GINSBERG'S TEST REFERENCE\nORDERING\nDelivery day: Thursday.\n\nCONTACTS\nTest Person — Sales Consultant\ntest.rep@example.com\nDirect/text: 555-0100\n\nCustomer number shown on supplied worksheet: 99999 (Test Customer Inc., DBA Test Lake).\n\nSAVED ATTACHMENTS\nsomething.pdf\n" },
};

export const driveLink = (id) => 'https://drive.google.com/file/d/' + id + '/view?usp=drivesdk';
