(() => {
  const local = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  if (location.protocol === "http:" && !local) {
    location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
  }
})();

