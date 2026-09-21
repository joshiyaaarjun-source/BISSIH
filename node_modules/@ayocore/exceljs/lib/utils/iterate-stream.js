const {once} = require('events');

module.exports = async function* iterateStream(stream) {
  const contents = [];
  let ended = false;
  let error = null;

  const onData = data => contents.push(data);
  const onEnd = () => {
    ended = true;
  };
  const onError = err => {
    error = err;
  };

  stream.on('data', onData);
  stream.on('end', onEnd);
  stream.on('error', onError);

  try {
    while (!ended || contents.length > 0) {
      if (contents.length > 0) {
        yield contents.shift();
        continue;
      }
      if (!ended) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.race([once(stream, 'data'), once(stream, 'end')]);
      }
      if (error) throw error;
    }
  } finally {
    stream.off('data', onData);
    stream.off('end', onEnd);
    stream.off('error', onError);
  }
};
