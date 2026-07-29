export const confirmTypedDelete = (subject = 'delete this item') => {
  const confirmation = window.prompt(`Type DELETE to confirm that you want to ${subject}.`);
  return confirmation?.trim().toLowerCase() === 'delete';
};
