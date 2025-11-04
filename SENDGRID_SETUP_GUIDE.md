# 📧 SendGrid Email Setup Guide

This guide will help you configure SendGrid for email sending in the Middleware BackendAPI.

---

## 🚀 Quick Setup

### Step 1: Install SendGrid Package

```bash
npm install @sendgrid/mail
```

### Step 2: Get SendGrid API Key

1. Sign up for a free SendGrid account at [https://sendgrid.com](https://sendgrid.com)
2. Navigate to **Settings** → **API Keys**
3. Click **Create API Key**
4. Name your API key (e.g., "Lead Marketplace Production")
5. Select **Full Access** or **Restricted Access** (with Mail Send permissions)
6. Copy the API key immediately (you won't be able to see it again)

### Step 3: Configure Environment Variables

Add to your `config.env` file:

```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.your-actual-api-key-here
EMAIL_FROM=noreply@your-domain.com
EMAIL_FROM_NAME=Lead Marketplace
FRONTEND_URL=https://app.leadmarketplace.com
```

### Step 4: Verify Sender Email (Important!)

SendGrid requires you to verify your sender email address:

1. Go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Fill in your sender information
4. Check your email and click the verification link
5. Use the verified email in `EMAIL_FROM`

**Note:** For production, you should set up Domain Authentication instead of Single Sender Verification for better deliverability.

---

## 📝 Configuration Details

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `EMAIL_PROVIDER` | Set to `sendgrid` | `sendgrid` |
| `SENDGRID_API_KEY` | Your SendGrid API key | `SG.xxxxxxxxxxxxx` |
| `EMAIL_FROM` | Verified sender email | `noreply@leadmarketplace.com` |
| `EMAIL_FROM_NAME` | Display name | `Lead Marketplace` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FRONTEND_URL` | Frontend URL for email links | `https://app.leadmarketplace.com` |

---

## 🧪 Testing SendGrid Configuration

### Test Email Sending

Create a test file `test-sendgrid.js`:

```javascript
require('dotenv').config({ path: './config.env' });
const emailService = require('./services/emailService');

async function test() {
  try {
    const result = await emailService.sendEmail({
      to: 'your-test-email@gmail.com',
      subject: 'Test Email from SendGrid',
      html: '<h1>Hello from SendGrid!</h1><p>This is a test email.</p>',
      text: 'Hello from SendGrid! This is a test email.'
    });
    
    console.log('✅ Email sent successfully:', result);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

test();
```

Run the test:
```bash
node test-sendgrid.js
```

### Test Password Reset Email

```javascript
require('dotenv').config({ path: './config.env' });
const emailService = require('./services/emailService');

async function test() {
  const result = await emailService.sendPasswordResetEmail(
    'test@example.com',
    'test-reset-token-12345'
  );
  console.log('Result:', result);
}

test();
```

---

## 📊 SendGrid Account Limits

### Free Tier:
- **100 emails/day** (forever free)
- Single Sender Verification
- Basic analytics

### Paid Plans:
- Start at $19.95/month
- 50,000+ emails/month
- Domain authentication
- Advanced analytics
- Dedicated IP options

---

## 🔒 Security Best Practices

1. **Never commit API keys to Git**
   - Keep `config.env` in `.gitignore`
   - Use environment variables in production

2. **Use Restricted API Keys**
   - Create API keys with minimal required permissions
   - Use different keys for staging/production

3. **Verify Sender Domain**
   - Set up domain authentication for production
   - Improves deliverability and prevents spam

4. **Monitor Email Activity**
   - Check SendGrid dashboard regularly
   - Set up alerts for bounces/blocks

---

## ✅ Verification Checklist

- [ ] SendGrid account created
- [ ] API key generated and copied
- [ ] `@sendgrid/mail` package installed
- [ ] Environment variables configured
- [ ] Sender email verified
- [ ] Test email sent successfully
- [ ] Password reset email tested
- [ ] Cancellation email tested

---

## 🐛 Troubleshooting

### Error: "API key is invalid"
- Verify `SENDGRID_API_KEY` is correct
- Ensure no extra spaces or quotes
- Regenerate API key if needed

### Error: "Sender email not verified"
- Go to SendGrid dashboard
- Verify your sender email address
- Wait a few minutes after verification

### Emails going to spam
- Verify sender email/domain
- Set up SPF/DKIM records
- Use domain authentication
- Avoid spam trigger words

### Rate limit exceeded
- Free tier: 100 emails/day
- Upgrade plan for higher limits
- Implement email queueing

---

## 📚 Additional Resources

- [SendGrid Documentation](https://docs.sendgrid.com/)
- [SendGrid Node.js Library](https://github.com/sendgrid/sendgrid-nodejs)
- [Email Best Practices](https://sendgrid.com/resource/email-deliverability-best-practices/)

---

## 🔄 Switching Email Providers

If you need to switch providers, just change `EMAIL_PROVIDER`:

```env
# To use SendGrid
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your-key

# To use SMTP (Nodemailer)
EMAIL_PROVIDER=nodemailer
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-password

# To use AWS SES
EMAIL_PROVIDER=ses
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

The email service automatically handles the switch!

---

**Setup Complete!** ✅

Your SendGrid integration is ready to use. Emails will now be sent via SendGrid for:
- Password reset emails
- Subscription cancellation confirmations
- Welcome emails
- All other email notifications

