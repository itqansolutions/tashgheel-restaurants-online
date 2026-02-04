// Create a simple test file to verify shop settings are saved
const settings = window.EnhancedSecurity?.getSecureData('shop_settings');
console.log('Shop Settings:', settings);

// Also check localStorage
console.log('Shop Name:', localStorage.getItem('shopName'));
console.log('Shop Logo:', localStorage.getItem('shopLogo')?.substring(0, 50) + '...');
console.log('Footer Message:', localStorage.getItem('footerMessage'));
