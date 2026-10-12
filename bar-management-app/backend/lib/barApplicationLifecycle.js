const normalize = (value) => String(value || '').trim().toLowerCase();

const matchesApplicationDetails = (application, details) => (
  application.status !== 'bar_deleted'
  && (
    normalize(application.barName) === normalize(details.barName)
    || normalize(application.ownerUsername) === normalize(details.ownerUsername)
  )
);

const applicationBelongsToBar = (application, bar) => {
  if (application.barId) {
    return String(application.barId) === String(bar._id || bar.id);
  }

  if (application.status !== 'approved' || normalize(application.barName) !== normalize(bar.name)) {
    return false;
  }

  const applicationCode = normalize(application.barCode);
  const barCode = normalize(bar.code);
  return !applicationCode || !barCode || applicationCode === barCode;
};

module.exports = { matchesApplicationDetails, applicationBelongsToBar };