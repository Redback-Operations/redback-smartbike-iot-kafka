#!/usr/bin/env node

// Enhanced Data Validation Test Script
console.log('🧪 Testing Enhanced Data Validation...');
console.log('=====================================');

// Mock device configuration
const mockDeviceConfig = {
  validationRules: { min: 30, max: 220, unit: 'bpm' }
};

// Test data validation function (simplified version)
function validateKafkaDeviceData(data, deviceConfig) {
  const errors = [];
  let qualityScore = 100;
  
  try {
    // Required field validation
    if (typeof data.value !== 'number' || isNaN(data.value)) {
      errors.push('Invalid or missing value field');
      qualityScore -= 50;
    }
    
    if (!data.unitName || typeof data.unitName !== 'string') {
      errors.push('Invalid or missing unitName field');
      qualityScore -= 30;
    }
    
    // Value range validation
    const { min, max, unit } = deviceConfig.validationRules;
    if (data.value < min || data.value > max) {
      errors.push(`Value ${data.value} out of range [${min}, ${max}] for unit ${unit}`);
      qualityScore -= 40;
    }
    
    // Unit consistency check
    if (data.unitName !== unit) {
      errors.push(`Unit mismatch: expected ${unit}, got ${data.unitName}`);
      qualityScore -= 20;
    }
    
    return {
      isValid: errors.length === 0,
      qualityScore: Math.max(0, qualityScore),
      errors
    };
    
  } catch (error) {
    errors.push(`Validation error: ${error}`);
    return {
      isValid: false,
      qualityScore: 0,
      errors
    };
  }
}

// Test cases
const testCases = [
  {
    name: 'Valid heart rate data',
    data: { value: 75, unitName: 'bpm', timestamp: Date.now() / 1000 },
    expected: { isValid: true, qualityScore: 100 }
  },
  {
    name: 'Invalid heart rate - too high',
    data: { value: 250, unitName: 'bpm', timestamp: Date.now() / 1000 },
    expected: { isValid: false, qualityScore: 60 }
  },
  {
    name: 'Invalid heart rate - wrong unit',
    data: { value: 75, unitName: 'rpm', timestamp: Date.now() / 1000 },
    expected: { isValid: false, qualityScore: 80 }
  },
  {
    name: 'Missing value field',
    data: { unitName: 'bpm', timestamp: Date.now() / 1000 },
    expected: { isValid: false, qualityScore: 50 }
  },
  {
    name: 'Missing unit field',
    data: { value: 75, timestamp: Date.now() / 1000 },
    expected: { isValid: false, qualityScore: 70 }
  }
];

// Run tests
let passedTests = 0;
let totalTests = testCases.length;

console.log('\nRunning validation tests...\n');

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  
  const result = validateKafkaDeviceData(testCase.data, mockDeviceConfig);
  
  console.log(`  Input: ${JSON.stringify(testCase.data)}`);
  console.log(`  Result: Valid=${result.isValid}, Quality=${result.qualityScore}%`);
  
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.join(', ')}`);
  }
  
  // Check if test passed (allowing some tolerance for quality score)
  const validationMatch = result.isValid === testCase.expected.isValid;
  const qualityInRange = Math.abs(result.qualityScore - testCase.expected.qualityScore) <= 10;
  
  if (validationMatch && qualityInRange) {
    console.log('  ✅ PASSED\n');
    passedTests++;
  } else {
    console.log(`  ❌ FAILED (Expected: Valid=${testCase.expected.isValid}, Quality=${testCase.expected.qualityScore}%)\n`);
  }
});

console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);

if (passedTests === totalTests) {
  console.log('🎉 All validation tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some validation tests failed!');
  process.exit(1);
}
