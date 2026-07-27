const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

(async () => {
  try {
    console.log('Logging in as default owner...');
    const loginResp = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, { username: process.env.TEST_OWNER_USERNAME || 'gsilungwe', password: process.env.TEST_OWNER_PASSWORD || 'godfrey1234' });

    console.log('Login response:', loginResp.status, loginResp.body);
    if (!loginResp.body || !loginResp.body.token) {
      console.error('Login failed, cannot test change-password');
      process.exit(1);
    }

    const token = loginResp.body.token;

    console.log('Calling change-password...');
    const changeResp = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/change-password',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, { currentPassword: process.env.TEST_OWNER_PASSWORD || 'godfrey1234', newPassword: 'newpass1234' });

    console.log('Change-password response:', changeResp.status, changeResp.body);
  } catch (error) {
    console.error('Error during test:', error);
    process.exit(1);
  }
})();
