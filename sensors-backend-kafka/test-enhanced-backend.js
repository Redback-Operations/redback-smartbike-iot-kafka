// Enhanced Backend Services Test - Phase 4 Validation
// Tests all enhanced bike management functionality with security integration

const axios = require('axios')

class EnhancedBackendTester {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl
    this.testResults = []
  }

  async runAllTests() {
    console.log('🚀 Starting Enhanced Backend Services Test Suite')
    console.log('=' * 60)
    
    try {
      // Basic connectivity test
      await this.testServerConnection()
      
      // Bike management tests
      await this.testBikeCreation()
      await this.testBikeRetrieval()
      await this.testBikeUpdate()
      await this.testBikeFiltering()
      
      // Security router tests
      await this.testSecurityDashboard()
      await this.testSecurityAudit()
      await this.testVulnerabilityScanning()
      await this.testEncryptionControl()
      
      // Maintenance router tests
      await this.testMaintenanceDashboard()
      await this.testFirmwareUpdate()
      await this.testMaintenanceScheduling()
      
      // Statistics and reporting tests
      await this.testStatisticsOverview()
      await this.testBikeStatus()
      
      this.printTestSummary()
      
    } catch (error) {
      console.error('💥 Test suite failed:', error.message)
      process.exit(1)
    }
  }

  async testServerConnection() {
    console.log('\n📡 Testing server connection...')
    try {
      const response = await axios.get(`${this.baseUrl}/health`)
      this.addResult('Server Connection', true, 'Server is responding')
    } catch (error) {
      this.addResult('Server Connection', false, `Server not responding: ${error.message}`)
      throw error
    }
  }

  async testBikeCreation() {
    console.log('\n🚲 Testing bike creation...')
    try {
      const testBike = {
        name: 'test-bike-enhanced',
        label: 'Enhanced Test Bike',
        description: 'Test bike for enhanced backend validation',
        mqttTopicPrefix: 'redback/bikes/test-enhanced',
        mqttReportTopicSuffix: 'telemetry',
        location: 'Test Lab',
        firmwareVersion: '2.1.0',
        securityLevel: 'HIGH',
        encryptionEnabled: true
      }

      const response = await axios.post(`${this.baseUrl}/bikes`, testBike)
      
      if (response.status === 201 && response.data.success) {
        this.addResult('Bike Creation', true, 'Successfully created enhanced bike')
        this.testBikeId = response.data.data._id || response.data.data.name
      } else {
        this.addResult('Bike Creation', false, 'Failed to create bike')
      }
    } catch (error) {
      this.addResult('Bike Creation', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testBikeRetrieval() {
    console.log('\n📋 Testing bike retrieval...')
    try {
      // Test getting all bikes
      const allBikesResponse = await axios.get(`${this.baseUrl}/bikes`)
      
      if (allBikesResponse.data.success && Array.isArray(allBikesResponse.data.data)) {
        this.addResult('Get All Bikes', true, `Retrieved ${allBikesResponse.data.count} bikes`)
      } else {
        this.addResult('Get All Bikes', false, 'Failed to retrieve bikes list')
      }

      // Test getting specific bike
      if (this.testBikeId) {
        const singleBikeResponse = await axios.get(`${this.baseUrl}/bikes/${this.testBikeId}`)
        
        if (singleBikeResponse.data.success && singleBikeResponse.data.data) {
          this.addResult('Get Single Bike', true, 'Successfully retrieved specific bike')
        } else {
          this.addResult('Get Single Bike', false, 'Failed to retrieve specific bike')
        }
      }
    } catch (error) {
      this.addResult('Bike Retrieval', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testBikeUpdate() {
    console.log('\n✏️ Testing bike updates...')
    try {
      if (!this.testBikeId) {
        this.addResult('Bike Update', false, 'No test bike available for update')
        return
      }

      const updateData = {
        status: 'maintenance',
        batteryLevel: 85,
        signalStrength: 95,
        performanceScore: 88
      }

      const response = await axios.put(`${this.baseUrl}/bikes/${this.testBikeId}`, updateData)
      
      if (response.data.success) {
        this.addResult('Bike Update', true, 'Successfully updated bike properties')
      } else {
        this.addResult('Bike Update', false, 'Failed to update bike')
      }
    } catch (error) {
      this.addResult('Bike Update', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testBikeFiltering() {
    console.log('\n🔍 Testing bike filtering...')
    try {
      // Test filtering by status
      const statusResponse = await axios.get(`${this.baseUrl}/bikes?status=active`)
      
      if (statusResponse.data.success) {
        this.addResult('Filter by Status', true, `Found ${statusResponse.data.count} active bikes`)
      } else {
        this.addResult('Filter by Status', false, 'Failed to filter by status')
      }

      // Test filtering by security score
      const securityResponse = await axios.get(`${this.baseUrl}/bikes?minSecurityScore=80`)
      
      if (securityResponse.data.success) {
        this.addResult('Filter by Security', true, `Found ${securityResponse.data.count} high-security bikes`)
      } else {
        this.addResult('Filter by Security', false, 'Failed to filter by security score')
      }
    } catch (error) {
      this.addResult('Bike Filtering', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testSecurityDashboard() {
    console.log('\n🛡️ Testing security dashboard...')
    try {
      const response = await axios.get(`${this.baseUrl}/bikes/security/dashboard`)
      
      if (response.data.success && response.data.data) {
        this.addResult('Security Dashboard', true, 'Successfully retrieved security dashboard')
      } else {
        this.addResult('Security Dashboard', false, 'Failed to retrieve security dashboard')
      }
    } catch (error) {
      this.addResult('Security Dashboard', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testSecurityAudit() {
    console.log('\n🔍 Testing security audit...')
    try {
      if (!this.testBikeId) {
        this.addResult('Security Audit', false, 'No test bike available for audit')
        return
      }

      const response = await axios.get(`${this.baseUrl}/bikes/${this.testBikeId}/security/audit`)
      
      if (response.data.success && response.data.data) {
        this.addResult('Security Audit', true, 'Successfully performed security audit')
      } else {
        this.addResult('Security Audit', false, 'Failed to perform security audit')
      }
    } catch (error) {
      this.addResult('Security Audit', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testVulnerabilityScanning() {
    console.log('\n🔎 Testing vulnerability scanning...')
    try {
      const response = await axios.get(`${this.baseUrl}/bikes/security/vulnerable`)
      
      if (response.data.success && Array.isArray(response.data.data)) {
        this.addResult('Vulnerability Scan', true, `Found ${response.data.count} vulnerable bikes`)
      } else {
        this.addResult('Vulnerability Scan', false, 'Failed to retrieve vulnerable bikes')
      }
    } catch (error) {
      this.addResult('Vulnerability Scan', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testEncryptionControl() {
    console.log('\n🔐 Testing encryption control...')
    try {
      if (!this.testBikeId) {
        this.addResult('Encryption Control', false, 'No test bike available for encryption test')
        return
      }

      const response = await axios.post(`${this.baseUrl}/bikes/${this.testBikeId}/security/encryption`, {
        enabled: true
      })
      
      if (response.data.success) {
        this.addResult('Encryption Control', true, 'Successfully controlled bike encryption')
      } else {
        this.addResult('Encryption Control', false, 'Failed to control encryption')
      }
    } catch (error) {
      this.addResult('Encryption Control', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testMaintenanceDashboard() {
    console.log('\n🔧 Testing maintenance dashboard...')
    try {
      const response = await axios.get(`${this.baseUrl}/bikes/maintenance/dashboard`)
      
      if (response.data.success && response.data.data) {
        this.addResult('Maintenance Dashboard', true, 'Successfully retrieved maintenance dashboard')
      } else {
        this.addResult('Maintenance Dashboard', false, 'Failed to retrieve maintenance dashboard')
      }
    } catch (error) {
      this.addResult('Maintenance Dashboard', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testFirmwareUpdate() {
    console.log('\n⬆️ Testing firmware update...')
    try {
      if (!this.testBikeId) {
        this.addResult('Firmware Update', false, 'No test bike available for firmware update')
        return
      }

      const response = await axios.post(`${this.baseUrl}/bikes/${this.testBikeId}/maintenance/firmware`, {
        version: '2.2.0',
        forceUpdate: false
      })
      
      if (response.data.success) {
        this.addResult('Firmware Update', true, 'Successfully initiated firmware update')
      } else {
        this.addResult('Firmware Update', false, 'Failed to initiate firmware update')
      }
    } catch (error) {
      this.addResult('Firmware Update', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testMaintenanceScheduling() {
    console.log('\n📅 Testing maintenance scheduling...')
    try {
      if (!this.testBikeId) {
        this.addResult('Maintenance Scheduling', false, 'No test bike available for scheduling')
        return
      }

      const response = await axios.post(`${this.baseUrl}/bikes/${this.testBikeId}/maintenance/schedule`, {
        type: 'routine',
        priority: 'medium',
        scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      
      if (response.data.success) {
        this.addResult('Maintenance Scheduling', true, 'Successfully scheduled maintenance')
      } else {
        this.addResult('Maintenance Scheduling', false, 'Failed to schedule maintenance')
      }
    } catch (error) {
      this.addResult('Maintenance Scheduling', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testStatisticsOverview() {
    console.log('\n📊 Testing statistics overview...')
    try {
      const response = await axios.get(`${this.baseUrl}/bikes/statistics/overview`)
      
      if (response.data.success && response.data.data) {
        this.addResult('Statistics Overview', true, 'Successfully retrieved statistics overview')
      } else {
        this.addResult('Statistics Overview', false, 'Failed to retrieve statistics')
      }
    } catch (error) {
      this.addResult('Statistics Overview', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  async testBikeStatus() {
    console.log('\n📈 Testing bike status...')
    try {
      if (!this.testBikeId) {
        this.addResult('Bike Status', false, 'No test bike available for status check')
        return
      }

      const response = await axios.get(`${this.baseUrl}/bikes/${this.testBikeId}/status`)
      
      if (response.data.success && response.data.data) {
        this.addResult('Bike Status', true, 'Successfully retrieved detailed bike status')
      } else {
        this.addResult('Bike Status', false, 'Failed to retrieve bike status')
      }
    } catch (error) {
      this.addResult('Bike Status', false, `Error: ${error.response?.data?.error || error.message}`)
    }
  }

  addResult(testName, success, message) {
    this.testResults.push({ testName, success, message })
    const icon = success ? '✅' : '❌'
    console.log(`  ${icon} ${testName}: ${message}`)
  }

  printTestSummary() {
    console.log('\n' + '=' * 60)
    console.log('📋 ENHANCED BACKEND SERVICES TEST SUMMARY')
    console.log('=' * 60)
    
    const passed = this.testResults.filter(r => r.success).length
    const total = this.testResults.length
    const percentage = ((passed / total) * 100).toFixed(1)
    
    console.log(`\n🎯 Overall Results: ${passed}/${total} tests passed (${percentage}%)`)
    
    if (passed === total) {
      console.log('\n🎉 ALL TESTS PASSED! Enhanced backend services are working correctly.')
      console.log('\n✨ Phase 4: Backend Services Migration - COMPLETE')
      console.log('\n🛡️ Security Integration: ACTIVE')
      console.log('🔧 Maintenance Management: ACTIVE') 
      console.log('📊 Statistics & Monitoring: ACTIVE')
      console.log('🚲 Enhanced Bike Management: ACTIVE')
    } else {
      console.log('\n⚠️ Some tests failed. Please check the failing components.')
      
      console.log('\n❌ Failed Tests:')
      this.testResults
        .filter(r => !r.success)
        .forEach(result => {
          console.log(`  • ${result.testName}: ${result.message}`)
        })
    }
    
    console.log('\n' + '=' * 60)
  }
}

// Run the test suite
if (require.main === module) {
  const tester = new EnhancedBackendTester()
  tester.runAllTests().catch(console.error)
}

module.exports = EnhancedBackendTester