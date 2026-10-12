const normalizeUsername = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const selectLoginUser = (users, identifier) => {
  const username = normalizeUsername(identifier);
  const usernameMatches = (users || []).filter((user) => normalizeUsername(user.username) === username);
  if (usernameMatches.length === 1) return { user: usernameMatches[0], ambiguous: false };
  if (usernameMatches.length > 1) return { user: null, ambiguous: true };

  const email = normalizeEmail(identifier);
  const emailMatches = (users || []).filter((user) => normalizeEmail(user.email) === email);
  if (emailMatches.length > 1) return { user: null, ambiguous: true };
  return { user: emailMatches[0] || null, ambiguous: false };
};

module.exports = { selectLoginUser };