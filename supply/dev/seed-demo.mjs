// Disposable demo data for the local preview only. Everything is labelled TEST.
// Admin password for the local preview: test-password-123
import { DRIVE_FILES, WEEKLY_ID, MASTER_ID, DELETED_ID, GRAPH_ID, REF_ID, driveLink } from '../test/fixtures.mjs';

export const DEMO_PASSWORD = 'test-password-123';

export function seedDemo(backend, env) {
  Object.assign(env.state.driveFiles, DRIVE_FILES);
  const call = (action, body) => {
    const r = backend.handleApi_(Object.assign({ action }, body || {}));
    if (!r.ok) throw new Error(action + ': ' + r.error.message);
    return r.data;
  };
  const code = backend.createAdminSetupCode();
  const { token } = call('adminSetup', { setupCode: code, newPassword: DEMO_PASSWORD, confirmPassword: DEMO_PASSWORD });
  call('adminImportGinsbergCommit', {
    token, weeklySheet: driveLink(WEEKLY_ID), masterSheet: driveLink(MASTER_ID), deletedCsv: driveLink(DELETED_ID),
    graphCsv: driveLink(GRAPH_ID), referenceTxt: driveLink(REF_ID),
  });
  const items = call('adminItems', { token }).items;
  const byNum = (n) => items.filter((i) => i.supplierItemNumber === n)[0];
  call('adminSaveItem', { token, id: byNum('90001').id, item: { department: 'housekeeping', category: 'Paper products', countingUnit: 'case', unitsPerCase: 96, looseUnitLabel: 'rolls', countingUnitConfirmed: true, unitsPerCaseConfirmed: true, desiredStock: 4, minimumStock: 4, active: true } });
  call('adminSaveItem', { token, id: byNum('90002').id, item: { department: 'cafe', category: 'Cups, to-go & utensils', countingUnit: 'case', unitsPerCase: 20, looseUnitLabel: 'sleeves (50 cups each)', countingUnitConfirmed: true, unitsPerCaseConfirmed: true, desiredStock: 3, minimumStock: 1, active: true } });
  call('adminSaveItem', { token, id: byNum('90003').id, item: { department: 'cafe', category: 'Frozen', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 6, minimumStock: 2, active: true } });
  call('adminSaveItem', { token, id: byNum('00412').id, item: { department: 'cafe', category: 'Dry & shelf-stable', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 2, minimumStock: 1, active: true } });
  call('adminSaveItem', { token, item: { name: 'TEST Hand soap refills', department: 'housekeeping', category: 'Trash & cleaning', countingUnit: 'case', countingUnitConfirmed: true, desiredStock: 2, active: true } });
  call('adminSaveSupply', { token, name: 'TEST Batteries AA', defaultUnit: 'packs' });
  call('adminSaveSupply', { token, name: 'TEST Light bulbs', defaultUnit: 'each' });
  call('adminSaveBevProduct', { token, product: { name: 'TEST IPA 12 oz can', type: 'beer', container: 'can', unitsPerCase: 24, packageConfirmed: true, active: true } });
  call('adminSaveBevProduct', { token, product: { name: 'TEST Craft root beer 12 oz bottle', type: 'craft soda', container: 'bottle', unitsPerCase: 12, packageConfirmed: true, active: true } });
  call('adminSaveBevProduct', { token, product: { name: 'TEST Cider (case size not confirmed)', type: 'cider', container: 'can' } });
  const bev = call('adminBev', { token }).products;
  call('adminSaveDrink', { token, name: 'TEST Sparkling water 12 oz', routing: 'supply' });
  call('adminSaveDrink', { token, name: 'TEST Craft root beer 12 oz bottle', routing: 'beverage', beverageProductId: bev.filter((p) => p.type === 'craft soda')[0].id });
  call('adminSaveDrink', { token, name: 'TEST Lemonade' });
  call('adminLogout', { token });
}
