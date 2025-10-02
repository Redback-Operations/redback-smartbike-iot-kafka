// Security Router for Enhanced Bike Management
// Phase 4: Backend Services Enhancement - Security Features

import { Router, Request, Response, NextFunction } from 'express'
import EnhancedBikeService from '../../services/enhanced-bike-service'
import StatusCodes from 'http-status-codes'

const securityRouter = Router()
const bikeService = new EnhancedBikeService()

/**
 * GET /bikes/security/dashboard
 * Get comprehensive security dashboard for all bikes
 */
securityRouter.get('/bikes/security/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Fetching security dashboard data...')
    const dashboard = await bikeService.getSecurityDashboard()
    
    res.status(StatusCodes.OK).json({
      success: true,
      data: dashboard,
      timestamp: new Date()
    })
  } catch (error) {
    console.error('Failed to fetch security dashboard:', error)
    next(error)
  }
})

/**
 * GET /bikes/:bikeId/security/audit
 * Perform comprehensive security audit for a specific bike
 */
securityRouter.get('/bikes/:bikeId/security/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.params
    
    if (!bikeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike ID is required'
      })
    }

    console.log(`Performing security audit for bike: ${bikeId}`)
    const audit = await bikeService.performSecurityAudit(bikeId)
    
    res.status(StatusCodes.OK).json({
      success: true,
      data: audit,
      bikeId,
      timestamp: new Date()
    })
  } catch (error) {
    console.error(`Security audit failed for bike ${req.params.bikeId}:`, error)
    if (error.message.includes('not found')) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Bike ${req.params.bikeId} not found`
      })
    }
    next(error)
  }
})

/**
 * GET /bikes/security/vulnerable
 * Get all bikes with security vulnerabilities
 */
securityRouter.get('/bikes/security/vulnerable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { minVulnerabilities = 1, maxSecurityScore = 75 } = req.query
    
    console.log(`Fetching vulnerable bikes (min vulnerabilities: ${minVulnerabilities}, max security score: ${maxSecurityScore})`)
    
    const vulnerableBikes = await bikeService.getAllBikes({})

    const filteredBikes = vulnerableBikes.filter(bike => 
      (bike.vulnerabilityCount || 0) >= Number(minVulnerabilities) ||
      (bike.securityScore || 0) <= Number(maxSecurityScore)
    )

    res.status(StatusCodes.OK).json({
      success: true,
      data: filteredBikes.map(bike => ({
        bikeId: bike.name,
        label: bike.label,
        location: bike.location,
        securityScore: bike.securityScore,
        vulnerabilityCount: bike.vulnerabilityCount,
        securityLevel: bike.securityLevel,
        vulnerabilityStatus: bike.vulnerabilityStatus,
        securityCompliance: bike.securityCompliance,
        lastSecurityScan: bike.lastSecurityScan,
        encryptionEnabled: bike.encryptionEnabled
      })),
      count: filteredBikes.length,
      filters: {
        minVulnerabilities: Number(minVulnerabilities),
        maxSecurityScore: Number(maxSecurityScore)
      },
      timestamp: new Date()
    })

  } catch (error) {
    console.error('Failed to fetch vulnerable bikes:', error)
    next(error)
  }
})

/**
 * POST /bikes/:bikeId/security/encryption
 * Enable or disable encryption for a bike
 */
securityRouter.post('/bikes/:bikeId/security/encryption', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.params
    const { enabled } = req.body
    
    if (!bikeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike ID is required'
      })
    }

    if (typeof enabled !== 'boolean') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Encryption enabled status must be a boolean'
      })
    }

    console.log(`${enabled ? 'Enabling' : 'Disabling'} encryption for bike: ${bikeId}`)
    
    const updatedBike = await bikeService.updateBike(bikeId, { 
      encryptionEnabled: enabled,
      securityLevel: enabled ? 'HIGH' : 'MEDIUM' // Auto-adjust security level
    })
    
    if (!updatedBike) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Bike ${bikeId} not found`
      })
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Encryption ${enabled ? 'enabled' : 'disabled'} for bike ${bikeId}`,
      data: {
        bikeId: updatedBike.name,
        encryptionEnabled: updatedBike.encryptionEnabled,
        securityLevel: updatedBike.securityLevel
      },
      timestamp: new Date()
    })

  } catch (error) {
    console.error(`Failed to update encryption for bike ${req.params.bikeId}:`, error)
    next(error)
  }
})

export default securityRouter