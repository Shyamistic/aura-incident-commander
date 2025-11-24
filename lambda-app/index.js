exports.handler = async (event) => {
  console.log('event', JSON.stringify(event));

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (body && body.fail) {
      console.error('Simulated failure triggered');
      throw new Error('Simulated failure');
    }
  } catch (e) {
    console.error('Handler error', e);
    throw e;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'ok' })
  };
};
