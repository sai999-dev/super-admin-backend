# 📧 Email Provider Setup Guide

Complete guide for setting up email sending in the Middleware BackendAPI.

---

## 🎯 Supported Providers

The email service supports three providers:

1. **Nodemailer (SMTP)** - Default, works with any SMTP server
2. **SendGrid** - Cloud email service (recommended for production)
3. **AWS SES** - Amazon Simple Email Service

---

## 📦 Package Installation

Install the package for your chosen provider:

```bash
# Option 1: SendGrid (Recommended)
npm install @sendgrid/mail

# Option 2: Nodemailer (Default - works with Gmail, Outlook, etc.)
npm install nodemailer

# Option 3: AWS SES
npm install aws-sdk
```

---

## ⚙️ Configuration

### Option 1: SendGrid (Recommended for Production)

**Step 1:** Get API Key
1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Go to Settings → API Keys
3. Create API Key with "Full Access" or "Mail Send" permission
4. Copy the API key

**Step 2:** Verify Sender Email
1. Go to Settings → Sender Authentication
2. Click "Verify a Single Sender"
3. Fill in your email and verify it
4. Use this verified email in `EMAIL_FROM`

**Step 3:** Configure Environment Variables
```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.your-api-key-here
EMAIL_FROM=verified-email@your-domain.com
EMAIL_FROM_NAME=Lead Marketplace
FRONTEND_URL=https://app.leadmarketplace.com
```

**Pros:**
- ✅ Easy setup
- ✅ Free tier: 100 emails/day
- ✅ High deliverability
- ✅ Good analytics

**Cons:**
- ❌ Limited free tier
- ❌ Requires sender verification

---

### Option 2: Nodemailer/SMTP (Default)

**Step 1:** Get SMTP Credentials

**For Gmail:**
1. Enable 2-Factor Authentication
2. Go to Google Account → Security
3. Create "App Password"
4. Use this as `SMTP_PASS`

**For Other Providers:**
- Get SMTP host, port, username, password from your email provider

**Step 2:** Configure Environment Variables
```env
EMAIL_PROVIDER=nodemailer
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=Lead Marketplace
FRONTEND_URL=https://app.leadmarketplace.com
```

**Pros:**
- ✅ Free
- ✅ Works with any SMTP server
- ✅ No account creation needed (if you have email)

**Cons:**
- ❌ Lower daily sending limits
- ❌ May need app passwords
- ❌ Lower deliverability than SendGrid

---

### Option 3: AWS SES

**Step 1:** Setup AWS SES
1. Sign up for AWS account
2. Go to AWS SES console
3. Verify sender email address
4. Create IAM user with SES access
5. Get Access Key ID and Secret Access Key

**Step 2:** Configure Environment Variables
```env
EMAIL_PROVIDER=ses
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
EMAIL_FROM=verified-email@your-domain.com
EMAIL_FROM_NAME=Lead Marketplace
FRONTEND_URL=https://app.leadmarketplace.com
```

**Pros:**
- ✅ Very cost-effective ($0.10 per 1000 emails)
- ✅ High deliverability
- ✅ Scales well

**Cons:**
- ❌ Requires AWS account setup
- ❌ More complex configuration
- ❌ Must verify sender in sandbox mode

---

## 🧪 Testing Your Configuration

### Quick Test Script

Create `test-email.js`:

```javascript
require('dotenv').config({ path: './config.env' });
const emailService = require('./services/emailService');

async function test() {
  console.log('Testing email configuration...\n');
  
  try {
    const result = await emailService.sendEmail({
      to: 'your-test-email@example.com',
      subject: 'Test Email',
      html: '<h1>Test Email</h1><p>This is a test from Lead Marketplace API.</p>',
      text: 'Test Email - This is a test from Lead Marketplace API.'
    });
    
    console.log('✅ Email sent successfully!');
    console.log('Result:', result);
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    if (error.response) {
      console.error('SendGrid Response:', error.response.body);
    }
  }
}

test();
```

Run:
```bash
node test-email.js
```

---

## 📋 Environment Variables Reference

### Required (All Providers)
```env
EMAIL_PROVIDER=sendgrid|nodemailer|ses
EMAIL_FROM=your-email@domain.com
EMAIL_FROM_NAME=Lead Marketplace
FRONTEND_URL=https://app.leadmarketplace.com
```

### SendGrid Specific
```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
```

### Nodemailer/SMTP Specific
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### AWS SES Specific
```env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
```

---

## ✅ Verification Checklist

- [ ] Email provider package installed
- [ ] Environment variables configured
- [ ] Sender email verified (SendGrid/SES)
- [ ] Test email sent successfully
- [ ] Password reset email tested
- [ ] Cancellation email tested
- [ ] Email queueing works (when provider unavailable)

---

## 🔄 Switching Providers

To switch providers, just change `EMAIL_PROVIDER`:

```env
# Switch to SendGrid
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your-key

# Switch to SMTP
EMAIL_PROVIDER=nodemailer
SMTP_HOST=smtp.gmail.com
# ... other SMTP vars

# Switch to SES
EMAIL_PROVIDER=ses
AWS_ACCESS_KEY_ID=your-key
# ... other AWS vars
```

No code changes needed! The service automatically detects and uses the configured provider.

---

## 🐛 Common Issues

### "Email provider not configured"
- Check `EMAIL_PROVIDER` is set correctly
- Verify provider-specific credentials are set
- Check package is installed

### "Sender email not verified"
- **SendGrid:** Verify in Settings → Sender Authentication
- **SES:** Verify in AWS SES console
- **SMTP:** Usually not required

### Emails in spam folder
- Verify sender email/domain
- Set up SPF/DKIM records
- Avoid spam trigger words
- Use domain authentication (SendGrid/SES)

### Rate limits
- **SendGrid Free:** 100/day
- **Gmail:** ~500/day
- **SES:** Starts in sandbox (200/day)

---

## 📊 Provider Comparison

| Feature | SendGrid | Nodemailer | AWS SES |
|---------|----------|------------|---------|
| Setup Difficulty | Easy | Easy | Medium |
| Free Tier | 100/day | Unlimited* | 200/day (sandbox) |
| Cost | $19.95/mo for 50k | Free | $0.10/1k |
| Deliverability | High | Medium | High |
| Analytics | Excellent | Basic | Good |
| Best For | Production | Development | High volume |

*Limited by your email provider

---

**Recommendation:** Use **SendGrid** for production - best balance of ease, cost, and deliverability.

