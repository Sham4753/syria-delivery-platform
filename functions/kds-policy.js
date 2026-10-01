const VENDOR_ROLES = ['vendor_admin', 'vendor_supervisor', 'vendor_cashier', 'kitchen_staff'];
const KDS_COLUMNS = ['pending', 'preparing', 'ready_for_pickup', 'picked_up'];

function isVendorRole(role) {
  return VENDOR_ROLES.includes(String(role || ''));
}

function canTransition(role, fromStatus, toStatus) {
  if (!isVendorRole(role)) return false;
  const transitions = {
    vendor_admin: {
      pending: ['preparing', 'cancelled'],
      preparing: ['ready_for_pickup', 'cancelled'],
      ready_for_pickup: ['cancelled'],
    },
    vendor_supervisor: {
      pending: ['preparing', 'cancelled'],
      preparing: ['ready_for_pickup', 'cancelled'],
      ready_for_pickup: ['cancelled'],
    },
    vendor_cashier: {
      pending: ['preparing', 'cancelled'],
      preparing: ['ready_for_pickup'],
    },
    kitchen_staff: {
      pending: ['preparing'],
      preparing: ['ready_for_pickup'],
    },
  };
  return Boolean(transitions[role]?.[fromStatus]?.includes(toStatus));
}

function kdsColumnFor(status) {
  return KDS_COLUMNS.includes(status) ? status : null;
}

module.exports = {VENDOR_ROLES, KDS_COLUMNS, isVendorRole, canTransition, kdsColumnFor};
