const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../modules/stream-check.js'), 'utf8');

async function panel(respond) {
  const requests = [];
  const result = await new Promise((resolve, reject) => {
    vm.runInNewContext(source, {
      $done: resolve,
      $httpClient: { get(options, callback) {
        requests.push(options);
        try {
          const response = respond(options.url);
          callback(response.error, { status: response.status, headers: response.headers || {} }, response.data || '');
        } catch (error) { reject(error); }
      } },
    });
  });
  for (const request of requests) {
    assert.equal(request['auto-cookie'], false);
    assert.equal(request.headers.Cookie, undefined);
  }
  return { ...result, requests };
}

const unavailable = () => ({ status: 503, data: '<html>Unavailable</html>\nloc=US' });

test('503、網路錯誤與無效內容不會把 AI 服務標為成功', async () => {
  for (const respond of [unavailable, () => ({ error: 'timeout' }), () => ({ status: 200, data: '<html>Challenge</html>' })]) {
    const result = await panel(respond);
    assert.match(result.content, /⚠️ ChatGPT/);
    assert.match(result.content, /⚠️ Claude/);
  }
});

test('ChatGPT 需要有效地區回應，Claude 需要有效出口地區', async () => {
  const result = await panel((url) => url.includes('cookie_requirements')
    ? { status: 200, data: '{"cookie_consent_required":false}' }
    : url.includes('/cdn-cgi/trace') ? { status: 200, data: 'loc=TW\r\n' } : unavailable());
  assert.match(result.content, /✅ ChatGPT　地區檢查通過・台灣/);
  assert.match(result.content, /✅ Claude　出口地區未列為封鎖・台灣/);
});

test('明確封鎖與無法判斷分開呈現', async () => {
  const result = await panel((url) => url.includes('cookie_requirements')
    ? { status: 403, data: '{"error":{"code":"unsupported_country"}}' }
    : { status: 200, data: 'loc=CN\n' });
  assert.match(result.content, /❌ ChatGPT　不支援這個地區/);
  assert.match(result.content, /❌ Claude　不支援這個地區/);
});

test('Netflix 轉址不會把請求送到相似網域', async () => {
  const result = await panel((url) => url.includes('www.netflix.com')
    ? { status: 302, headers: { location: 'https://evilnetflix.com/us/title/70143836' } }
    : unavailable());
  assert.equal(result.requests.some((r) => r.url.includes('evilnetflix.com')), false);
});

test('TikTok 任意轉址與沒有地區的頁面不能視為可用', async () => {
  for (const response of [{ status: 302, headers: { location: '/challenge' } }, { status: 200, data: '<html>Sign in</html>' }]) {
    const result = await panel((url) => url.includes('tiktok.com') ? response : unavailable());
    assert.match(result.content, /⚠️ TikTok/);
  }
});
