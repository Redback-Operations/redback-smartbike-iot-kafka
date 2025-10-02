// Enhanced Bike Routes - Phase 4: Backend Services Migration
// Main router combining all bike-related functionality

import { Router, Request, Response, NextFunction } from 'express'
import EnhancedBikeService from '../../services/enhanced-bike-service'
import securityRouter from './security-router'
import maintenanceRouter from './maintenance-router'
import StatusCodes from 'http-status-codes'

const bikeRouter = Router()
const bikeService = new EnhancedBikeService()

// Mount sub-routers
bikeRouter.use('/security', securityRouter)
bikeRouter.use('/maintenance', maintenanceRouter)

/**
 * GET /bikes
 * Get all bikes with optional filtering
 */
bikeRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      status,
      location,
      minSecurityScore,
      maxVulnerabilities,
      hasMaintenanceScheduled 
    } = req.query

    const filters: any = {}
    
    if (status) filters.status = status
    if (location) filters.location = location
    if (minSecurityScore) filters.minSecurityScore = Number(minSecurityScore)
    if (maxVulnerabilities) filters.maxVulnerabilities = Number(maxVulnerabilities)
    if (hasMaintenanceScheduled) filters.hasMaintenanceScheduled = hasMaintenanceScheduled === 'true'

    console.log('Fetching bikes with filters:', filters)
    const bikes = await bikeService.getAllBikes(filters)
    
    res.status(StatusCodes.OK).json({
      success: true,
      data: bikes,
      count: bikes.length,
      filters,
      timestamp: new Date()
    })
  } catch (error) {
    console.error('Failed to fetch bikes:', error)
    next(error)
  }
})

/**
 * GET /bikes/:bikeId
 * Get a specific bike by ID
 */
bikeRouter.get('/:bikeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.params
    
    if (!bikeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike ID is required'
      })
    }

    console.log(`Fetching bike: ${bikeId}`)
    const bike = await bikeService.getBikeById(bikeId)
    
    if (!bike) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Bike ${bikeId} not found`
      })
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: bike,
      timestamp: new Date()
    })
  } catch (error) {
    console.error(`Failed to fetch bike ${req.params.bikeId}:`, error)
    next(error)
  }
})

/**
 * POST /bikes
 * Create a new bike
 */
bikeRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bikeData = req.body
    
    if (!bikeData.name) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike name is required'
      })
    }

    console.log(`Creating new bike: ${bikeData.name}`)
    const newBike = await bikeService.createBike(bikeData)
    
    res.status(StatusCodes.CREATED).json({
      success: true,
      data: newBike,
      message: `Bike ${newBike.name} created successfully`,
      timestamp: new Date()
    })
  } catch (error) {
    console.error('Failed to create bike:', error)
    if (error.message.includes('duplicate') || error.code === 11000) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        error: 'Bike with this name already exists'
      })
    }
    next(error)
  }
})

/**
 * PUT /bikes/:bikeId
 * Update a bike
 */
bikeRouter.put('/:bikeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.params
    const updateData = req.body
    
    if (!bikeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike ID is required'
      })
    }

    console.log(`Updating bike: ${bikeId}`)
    const updatedBike = await bikeService.updateBike(bikeId, updateData)
    
    if (!updatedBike) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Bike ${bikeId} not found`
      })
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: updatedBike,
      message: `Bike ${bikeId} updated successfully`,
      timestamp: new Date()
    })
  } catch (error) {
    console.error(`Failed to update bike ${req.params.bikeId}:`, error)
    next(error)
  }
})

/**
 * DELETE /bikes/:bikeId
 * Delete a bike
 */
bikeRouter.delete('/:bikeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.params
    
    if (!bikeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike ID is required'
      })
    }

    console.log(`Deleting bike: ${bikeId}`)
    const deleted = await bikeService.deleteBike(bikeId)
    
    if (!deleted) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Bike ${bikeId} not found`
      })
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Bike ${bikeId} deleted successfully`,
      timestamp: new Date()
    })
  } catch (error) {
    console.error(`Failed to delete bike ${req.params.bikeId}:`, error)
    next(error)
  }
})

/**
 * GET /bikes/:bikeId/status
 * Get detailed status information for a bike
 */
bikeRouter.get('/:bikeId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.params
    
    if (!bikeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike ID is required'
      })
    }

    console.log(`Fetching status for bike: ${bikeId}`)
    const bike = await bikeService.getBikeById(bikeId)
    
    if (!bike) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Bike ${bikeId} not found`
      })
    }

    // Generate comprehensive status report
    const statusReport = {
      bikeId: bike.name,
      label: bike.label,
      currentStatus: bike.status,
      location: bike.location,
      
      // Operational Status
      operational: {
        isActive: bike.status === 'active',
        isOnline: bike.status !== 'offline',
        lastSeen: bike.lastSeen,
        uptime: bike.uptime || 0
      },
      
      // Security Status
      security: {
        securityScore: bike.securityScore,
        securityLevel: bike.securityLevel,
        vulnerabilityCount: bike.vulnerabilityCount,
        vulnerabilityStatus: bike.vulnerabilityStatus,
        encryptionEnabled: bike.encryptionEnabled,
        lastSecurityScan: bike.lastSecurityScan,
        securityCompliance: bike.securityCompliance
      },
      
      // Maintenance Status
      maintenance: {
        maintenanceStatus: bike.maintenanceStatus,
        lastMaintenance: bike.lastMaintenance,
        nextMaintenanceDue: bike.nextMaintenanceDue,
        maintenanceScore: bike.maintenanceScore,
        firmwareVersion: bike.firmwareVersion,
        needsUpdate: bike.firmwareUpdateAvailable
      },
      
      // Component Status
      components: bike.components || [],
      
      // Performance Metrics
      performance: {
        batteryLevel: bike.batteryLevel,
        signalStrength: bike.signalStrength,
        performanceScore: bike.performanceScore
      }
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: statusReport,
      timestamp: new Date()
    })
  } catch (error) {
    console.error(`Failed to fetch status for bike ${req.params.bikeId}:`, error)
    next(error)
  }
})

/**
 * GET /bikes/statistics/overview
 * Get overview statistics for all bikes
 */
bikeRouter.get('/statistics/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Generating bike statistics overview...')
    const bikes = await bikeService.getAllBikes()
    
    const overview = {
      total: bikes.length,
      
      byStatus: bikes.reduce((acc, bike) => {
        acc[bike.status] = (acc[bike.status] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      
      byLocation: bikes.reduce((acc, bike) => {
        acc[bike.location] = (acc[bike.location] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      
      security: {
        averageSecurityScore: bikes.reduce((sum, bike) => sum + (bike.securityScore || 0), 0) / bikes.length,
        highSecurity: bikes.filter(bike => (bike.securityScore || 0) >= 80).length,
        vulnerableBikes: bikes.filter(bike => (bike.vulnerabilityCount || 0) > 0).length,
        encryptionEnabled: bikes.filter(bike => bike.encryptionEnabled).length
      },
      
      maintenance: {
        needsMaintenance: bikes.filter(bike => bike.maintenanceStatus === 'due').length,
        overdueMaintenance: bikes.filter(bike => bike.maintenanceStatus === 'overdue').length,
        averageMaintenanceScore: bikes.reduce((sum, bike) => sum + (bike.maintenanceScore || 0), 0) / bikes.length,
        firmwareUpdatesAvailable: bikes.filter(bike => bike.firmwareUpdateAvailable).length
      },
      
      performance: {
        averagePerformanceScore: bikes.reduce((sum, bike) => sum + (bike.performanceScore || 0), 0) / bikes.length,
        lowBattery: bikes.filter(bike => (bike.batteryLevel || 0) < 20).length,
        poorSignal: bikes.filter(bike => (bike.signalStrength || 0) < 30).length
      }
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: overview,
      generatedAt: new Date(),
      timestamp: new Date()
    })
  } catch (error) {
    console.error('Failed to generate bike statistics overview:', error)
    next(error)
  }
})

export default bikeRouter