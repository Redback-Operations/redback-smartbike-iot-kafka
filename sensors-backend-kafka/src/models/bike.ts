import { model, Schema } from 'mongoose'
import uniqueValidator from 'mongoose-unique-validator'

interface IComponent {
  name: string
  version: string
  type: 'microcontroller' | 'sensor' | 'ai_module' | 'communication' | 'power'
  status?: 'active' | 'inactive' | 'maintenance'
  lastUpdate?: Date
}

interface IBike {
  _id: Schema.Types.ObjectId
  name: string
  label: string
  description: string
  mqttTopicPrefix: string
  mqttReportTopicSuffix: string
  
  // Enhanced bike properties
  location?: string
  status: 'active' | 'inactive' | 'maintenance' | 'offline'
  batteryLevel?: number
  firmwareVersion: string
  lastMaintenance?: Date
  lastSeen?: Date
  uptime?: number
  signalStrength?: number
  performanceScore?: number
  
  // Security properties
  securityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  encryptionEnabled: boolean
  certificateId?: string
  vulnerabilityStatus: 'secure' | 'scanning' | 'vulnerable' | 'patching'
  securityScore?: number
  vulnerabilityCount?: number
  lastSecurityScan?: Date
  publicKeyFingerprint?: string
  securityCompliance?: 'COMPLIANT' | 'NEEDS_ATTENTION' | 'NEEDS_SETUP'
  
  // Maintenance properties
  maintenanceStatus?: 'current' | 'due' | 'overdue'
  nextMaintenanceDue?: Date
  maintenanceScore?: number
  firmwareUpdateAvailable?: boolean
  
  // Component management
  components: IComponent[]
  
  // Operational data
  totalDistance?: number
  totalRides?: number
  averageSpeed?: number
  
  // Timestamps
  createdAt: Date
  updatedAt: Date

  // Methods
  needsSecurityUpdate(): boolean
  updateSecurityStatus(score: number, vulnCount: number): void
}

const componentSchema = new Schema<IComponent>({
  name: { type: String, required: true },
  version: { type: String, required: true },
  type: { 
    type: String, 
    required: true,
    enum: ['microcontroller', 'sensor', 'ai_module', 'communication', 'power']
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active'
  },
  lastUpdate: { type: Date, default: Date.now }
}, { _id: false })

const bikeSchema = new Schema<IBike>(
  {
    name: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    description: { type: String, required: true },
    mqttTopicPrefix: { type: String, required: true },
    mqttReportTopicSuffix: { type: String, required: true },
    
    // Enhanced properties
    location: { type: String },
    status: { 
      type: String, 
      enum: ['active', 'inactive', 'maintenance', 'offline'],
      default: 'active'
    },
    batteryLevel: { type: Number, min: 0, max: 100 },
    firmwareVersion: { type: String, required: true },
    lastMaintenance: { type: Date },
    lastSeen: { type: Date },
    uptime: { type: Number, min: 0, default: 0 },
    signalStrength: { type: Number, min: 0, max: 100 },
    performanceScore: { type: Number, min: 0, max: 100 },
    
    // Security properties
    securityLevel: { 
      type: String, 
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM'
    },
    encryptionEnabled: { type: Boolean, default: false },
    certificateId: { type: String },
    vulnerabilityStatus: { 
      type: String, 
      enum: ['secure', 'scanning', 'vulnerable', 'patching'],
      default: 'scanning'
    },
    securityScore: { type: Number, min: 0, max: 100 },
    vulnerabilityCount: { type: Number, min: 0, default: 0 },
    lastSecurityScan: { type: Date },
    publicKeyFingerprint: { type: String },
    securityCompliance: { 
      type: String, 
      enum: ['COMPLIANT', 'NEEDS_ATTENTION', 'NEEDS_SETUP'],
      default: 'NEEDS_SETUP'
    },
    
    // Maintenance properties
    maintenanceStatus: { 
      type: String, 
      enum: ['current', 'due', 'overdue'],
      default: 'current'
    },
    nextMaintenanceDue: { type: Date },
    maintenanceScore: { type: Number, min: 0, max: 100 },
    firmwareUpdateAvailable: { type: Boolean, default: false },
    
    // Component management
    components: [componentSchema],
    
    // Operational data
    totalDistance: { type: Number, min: 0, default: 0 },
    totalRides: { type: Number, min: 0, default: 0 },
    averageSpeed: { type: Number, min: 0 },
    
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { timestamps: true }
)

// Add indexes for better query performance
bikeSchema.index({ name: 1 })
bikeSchema.index({ status: 1 })
bikeSchema.index({ location: 1 })
bikeSchema.index({ securityLevel: 1 })
bikeSchema.index({ vulnerabilityStatus: 1 })

// Virtual for security health
bikeSchema.virtual('securityHealth').get(function() {
  if (this.securityScore >= 90) return 'EXCELLENT'
  if (this.securityScore >= 75) return 'GOOD'
  if (this.securityScore >= 50) return 'FAIR'
  return 'POOR'
})

// Method to check if bike needs security update
bikeSchema.methods.needsSecurityUpdate = function(): boolean {
  if (!this.lastSecurityScan) return true
  const daysSinceLastScan = (Date.now() - this.lastSecurityScan.getTime()) / (1000 * 60 * 60 * 24)
  return daysSinceLastScan > 7 // More than 7 days
}

// Method to update security status
bikeSchema.methods.updateSecurityStatus = function(score: number, vulnCount: number) {
  this.securityScore = score
  this.vulnerabilityCount = vulnCount
  this.lastSecurityScan = new Date()
  this.vulnerabilityStatus = vulnCount === 0 ? 'secure' : vulnCount > 5 ? 'vulnerable' : 'scanning'
  this.securityCompliance = score >= 80 ? 'COMPLIANT' : 'NEEDS_ATTENTION'
}

bikeSchema.plugin(uniqueValidator)

const bikeModel = model<IBike>('Bike', bikeSchema)

export { bikeModel, IBike, IComponent, bikeSchema }
