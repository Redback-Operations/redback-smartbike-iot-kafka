// Maintenance Router for Enhanced Bike Management
// Phase 4: Backend Services Enhancement - Maintenance Features

import { Router, Request, Response, NextFunction } from 'express'
import EnhancedBikeService from '../../services/enhanced-bike-service'
import StatusCodes from 'http-status-codes'

const maintenanceRouter = Router()
const bikeService = new EnhancedBikeService()

/**
 * GET /bikes/maintenance/recommendations
 * Get maintenance recommendations for all bikes or specific bike
 */
maintenanceRouter.get('/bikes/maintenance/recommendations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.query
    
    console.log(`Generating maintenance recommendations${bikeId ? ` for bike: ${bikeId}` : ' for all bikes'}`)
    const recommendations = await bikeService.generateMaintenanceRecommendations(bikeId as string)
    
    res.status(StatusCodes.OK).json({
      success: true,
      data: recommendations,
      count: recommendations.length,
      timestamp: new Date()
    })
  } catch (error) {
    console.error('Failed to generate maintenance recommendations:', error)
    next(error)
  }
})

/**
 * PUT /bikes/:bikeId/firmware
 * Update firmware version for a specific bike
 */
maintenanceRouter.put('/bikes/:bikeId/firmware', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.params
    const { version } = req.body
    
    if (!bikeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike ID is required'
      })
    }

    if (!version) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Firmware version is required'
      })
    }

    console.log(`Updating firmware for bike ${bikeId} to version: ${version}`)
    const updatedBike = await bikeService.updateFirmware(bikeId, version)
    
    if (!updatedBike) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Bike ${bikeId} not found`
      })
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Firmware updated successfully for bike ${bikeId}`,
      data: {
        bikeId: updatedBike.name,
        oldVersion: req.body.oldVersion || 'unknown',
        newVersion: updatedBike.firmwareVersion,
        lastMaintenance: updatedBike.lastMaintenance,
        vulnerabilityStatus: updatedBike.vulnerabilityStatus
      },
      timestamp: new Date()
    })

  } catch (error) {
    console.error(`Failed to update firmware for bike ${req.params.bikeId}:`, error)
    next(error)
  }
})

/**
 * GET /bikes/:bikeId/maintenance/status
 * Get maintenance status for a specific bike
 */
maintenanceRouter.get('/bikes/:bikeId/maintenance/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.params
    
    if (!bikeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike ID is required'
      })
    }

    console.log(`Fetching maintenance status for bike: ${bikeId}`)
    const bike = await bikeService.getBikeById(bikeId)
    
    if (!bike) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Bike ${bikeId} not found`
      })
    }

    // Calculate maintenance metrics
    const daysSinceLastMaintenance = bike.lastMaintenance 
      ? Math.floor((Date.now() - bike.lastMaintenance.getTime()) / (1000 * 60 * 60 * 24))
      : null

    const maintenanceStatus = {
      bikeId: bike.name,
      label: bike.label,
      status: bike.status,
      batteryLevel: bike.batteryLevel,
      firmwareVersion: bike.firmwareVersion,
      lastMaintenance: bike.lastMaintenance,
      daysSinceLastMaintenance,
      needsMaintenance: daysSinceLastMaintenance ? daysSinceLastMaintenance > 30 : true,
      components: bike.components.map(comp => ({
        name: comp.name,
        version: comp.version,
        type: comp.type,
        status: comp.status,
        lastUpdate: comp.lastUpdate
      })),
      securityHealth: {
        securityScore: bike.securityScore,
        vulnerabilityCount: bike.vulnerabilityCount,
        securityCompliance: bike.securityCompliance,
        encryptionEnabled: bike.encryptionEnabled
      }
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: maintenanceStatus,
      timestamp: new Date()
    })

  } catch (error) {
    console.error(`Failed to fetch maintenance status for bike ${req.params.bikeId}:`, error)
    next(error)
  }
})

/**
 * POST /bikes/:bikeId/maintenance/schedule
 * Schedule maintenance for a specific bike
 */
maintenanceRouter.post('/bikes/:bikeId/maintenance/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.params
    const { maintenanceType, scheduledDate, description } = req.body
    
    if (!bikeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike ID is required'
      })
    }

    if (!maintenanceType) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Maintenance type is required'
      })
    }

    console.log(`Scheduling ${maintenanceType} maintenance for bike: ${bikeId}`)
    
    // Update bike status to maintenance if immediate
    const isImmediate = new Date(scheduledDate) <= new Date()
    const updateData: any = {}
    
    if (isImmediate) {
      updateData.status = 'maintenance'
    }

    const updatedBike = await bikeService.updateBike(bikeId, updateData)
    
    if (!updatedBike) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Bike ${bikeId} not found`
      })
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Maintenance scheduled for bike ${bikeId}`,
      data: {
        bikeId: updatedBike.name,
        maintenanceType,
        scheduledDate: scheduledDate || new Date(),
        description: description || `${maintenanceType} maintenance`,
        status: updatedBike.status,
        immediate: isImmediate
      },
      timestamp: new Date()
    })

  } catch (error) {
    console.error(`Failed to schedule maintenance for bike ${req.params.bikeId}:`, error)
    next(error)
  }
})

/**
 * PUT /bikes/:bikeId/maintenance/complete
 * Mark maintenance as completed for a specific bike
 */
maintenanceRouter.put('/bikes/:bikeId/maintenance/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId } = req.params
    const { maintenanceType, notes, componentsReplaced } = req.body
    
    if (!bikeId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Bike ID is required'
      })
    }

    console.log(`Completing maintenance for bike: ${bikeId}`)
    
    const updateData = {
      status: 'active', // Return to active status
      lastMaintenance: new Date(),
      // Reset vulnerability status to trigger new scan after maintenance
      vulnerabilityStatus: 'scanning'
    }

    const updatedBike = await bikeService.updateBike(bikeId, updateData)
    
    if (!updatedBike) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: `Bike ${bikeId} not found`
      })
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Maintenance completed for bike ${bikeId}`,
      data: {
        bikeId: updatedBike.name,
        maintenanceType: maintenanceType || 'general',
        completedAt: updatedBike.lastMaintenance,
        notes: notes || 'Maintenance completed successfully',
        componentsReplaced: componentsReplaced || [],
        status: updatedBike.status,
        nextSecurityScan: 'scheduled'
      },
      timestamp: new Date()
    })

  } catch (error) {
    console.error(`Failed to complete maintenance for bike ${req.params.bikeId}:`, error)
    next(error)
  }
})

/**
 * GET /bikes/maintenance/overview
 * Get maintenance overview for all bikes
 */
maintenanceRouter.get('/bikes/maintenance/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Generating maintenance overview for all bikes...')
    
    const bikes = await bikeService.getAllBikes()
    const now = new Date()
    
    const maintenanceOverview = {
      totalBikes: bikes.length,
      activeBikes: bikes.filter(b => b.status === 'active').length,
      bikesInMaintenance: bikes.filter(b => b.status === 'maintenance').length,
      bikesNeedingMaintenance: bikes.filter(b => {
        if (!b.lastMaintenance) return true
        const daysSince = (now.getTime() - b.lastMaintenance.getTime()) / (1000 * 60 * 60 * 24)
        return daysSince > 30
      }).length,
      lowBatteryBikes: bikes.filter(b => b.batteryLevel && b.batteryLevel < 20).length,
      outdatedFirmware: bikes.filter(b => b.firmwareVersion < '2.2.0').length, // Assuming 2.2.0 is latest
      averageBatteryLevel: bikes.filter(b => b.batteryLevel).reduce((sum, b) => sum + b.batteryLevel!, 0) / bikes.filter(b => b.batteryLevel).length || 0,
      firmwareVersions: bikes.reduce((acc, bike) => {
        acc[bike.firmwareVersion] = (acc[bike.firmwareVersion] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      maintenanceByLocation: bikes.reduce((acc, bike) => {
        const location = bike.location || 'Unknown'
        if (!acc[location]) {
          acc[location] = {
            total: 0,
            needsMaintenance: 0,
            inMaintenance: 0
          }
        }
        acc[location].total++
        if (bike.status === 'maintenance') acc[location].inMaintenance++
        
        const daysSince = bike.lastMaintenance 
          ? (now.getTime() - bike.lastMaintenance.getTime()) / (1000 * 60 * 60 * 24)
          : 999
        if (daysSince > 30) acc[location].needsMaintenance++
        
        return acc
      }, {} as Record<string, any>)
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: maintenanceOverview,
      timestamp: new Date()
    })

  } catch (error) {
    console.error('Failed to generate maintenance overview:', error)
    next(error)
  }
})

export default maintenanceRouter