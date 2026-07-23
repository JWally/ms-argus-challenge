function handler(event) {
  var request = event.request;
  var uri = request.uri || '/';
  if (uri === '/' || uri === '') {
    request.uri = '/index.html';
    return request;
  }
  if (uri.indexOf('/api/') === 0 || uri.split('/').pop().indexOf('.') !== -1) {
    return request;
  }
  request.uri = '/index.html';
  return request;
}
