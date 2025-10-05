import { Router } from 'express'
import enhancedBikeRouter from './index'  // Our new enhanced bike router
import getRouter from './get-router'
import upsertRouter from './upsert-router'
import deleteRouter from './delete-router'

const baseRouter = Router()

// Use the enhanced bike router for /bikes routes
baseRouter.use('/bikes', enhancedBikeRouter)

// Keep existing routes for backwards compatibility
baseRouter.use('/', getRouter)
baseRouter.use('/', upsertRouter)
baseRouter.use('/', deleteRouter)

export default baseRouter
