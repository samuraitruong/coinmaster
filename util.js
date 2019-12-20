module.exports = {
  findCodeInQuery: (url) => {
    const decodedUrl = decodeURIComponent(url);
    const matched = decodedUrl.match(/c=([^&]*)/i);
    if (matched && matched.length > 1) {
      return decodeURIComponent(matched[1])
    };
    return null;
  }
}