export const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE as string);

export const COMMON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': '*'
};
