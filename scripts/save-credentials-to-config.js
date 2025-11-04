/**
 * Save Supabase Credentials to config.env
 * Creates or updates config.env with Supabase credentials
 */

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'config.env');

const SUPABASE_URL = 'https://ioqjonxjptvshdwhbuzv.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcWpvbnhqcHR2c2hkd2hidXp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTQ4MzQyNSwiZXhwIjoyMDc3MDU5NDI1fQ.ncz4UBVevblo9BGNhSezwYGpFopuyyhfYahtd__2eIs';

console.log('💾 Saving Supabase credentials to config.env...\n');

let configContent = '';

// Read existing config if it exists
if (fs.existsSync(configPath)) {
  configContent = fs.readFileSync(configPath, 'utf8');
  console.log('✅ Found existing config.env');
} else {
  console.log('📝 Creating new config.env');
}

// Check if credentials already exist
const hasUrl = configContent.includes('SUPABASE_URL');
const hasKey = configContent.includes('SUPABASE_SERVICE_KEY') || configContent.includes('SERVICE_KEY');

if (hasUrl && hasKey) {
  console.log('⚠️  Credentials already exist in config.env');
  console.log('   Updating with latest values...\n');
  
  // Update existing values
  configContent = configContent.replace(/SUPABASE_URL=.*/g, `SUPABASE_URL=${SUPABASE_URL}`);
  configContent = configContent.replace(/SUPABASE_SERVICE_KEY=.*/g, `SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}`);
  configContent = configContent.replace(/SERVICE_KEY=.*/g, `SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}`);
} else {
  console.log('📝 Adding credentials...\n');
  
  // Add credentials
  if (configContent && !configContent.endsWith('\n')) {
    configContent += '\n';
  }
  configContent += `# Supabase Configuration\n`;
  configContent += `SUPABASE_URL=${SUPABASE_URL}\n`;
  configContent += `SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}\n`;
  configContent += `\n# Alternative variable names (also supported)\n`;
  configContent += `SERVICE_KEY=${SUPABASE_SERVICE_KEY}\n`;
}

// Write to file
fs.writeFileSync(configPath, configContent);

console.log('✅ Credentials saved to config.env');
console.log(`   Path: ${configPath}\n`);
console.log('⚠️  IMPORTANT: Make sure config.env is in .gitignore!');
console.log('   Add this line to .gitignore:');
console.log('   config.env\n');

// Verify .gitignore
const gitignorePath = path.join(__dirname, '..', '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  if (!gitignore.includes('config.env') && !gitignore.includes('.env')) {
    console.log('⚠️  Warning: config.env not in .gitignore!');
    console.log('   Adding to .gitignore...');
    const updatedGitignore = gitignore + (gitignore.endsWith('\n') ? '' : '\n') + 'config.env\n';
    fs.writeFileSync(gitignorePath, updatedGitignore);
    console.log('   ✅ Added config.env to .gitignore\n');
  }
}

console.log('✅ Setup complete! Now all scripts will automatically connect.\n');

