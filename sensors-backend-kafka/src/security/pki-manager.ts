// PKI and Key Management System for IoT Security
// Assignment 2: Encryption & PKI Implementation

import * as crypto from 'crypto';
import { X509Certificate } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  algorithm: string;
  keySize: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface CertificateInfo {
  serialNumber: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  publicKey: string;
  isRevoked: boolean;
  revokedAt?: Date;
  revokedReason?: string;
}

export interface DigitalSignature {
  signature: string;
  algorithm: string;
  publicKey: string;
  timestamp: number;
  data: string;
}

export class PKIManager {
  private keyStore = new Map<string, KeyPair>();
  private certificateStore = new Map<string, CertificateInfo>();
  private crl = new Set<string>(); // Certificate Revocation List
  private readonly keyStorePath: string;
  private readonly crlPath: string;

  constructor(baseStorePath: string = './security-store') {
    this.keyStorePath = path.join(baseStorePath, 'keys');
    this.crlPath = path.join(baseStorePath, 'crl.json');
    this.initializeStorage();
  }

  /**
   * Initialize secure storage directories
   */
  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.keyStorePath, { recursive: true });
      await fs.mkdir(path.dirname(this.crlPath), { recursive: true });
      await this.loadCRL();
    } catch (error) {
      console.error('Failed to initialize PKI storage:', error);
    }
  }

  /**
   * Generate a new RSA key pair for device or service
   */
  async generateKeyPair(
    entityId: string,
    keySize: number = 2048,
    expirationDays: number = 365
  ): Promise<KeyPair> {
    try {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: keySize,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      const keyPair: KeyPair = {
        publicKey,
        privateKey,
        algorithm: 'RSA',
        keySize,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000)
      };

      // Store securely
      await this.storeKeyPair(entityId, keyPair);
      this.keyStore.set(entityId, keyPair);

      console.log(`Generated ${keySize}-bit RSA key pair for entity: ${entityId}`);
      return keyPair;
    } catch (error) {
      console.error('Key pair generation failed:', error);
      throw new Error(`Failed to generate key pair for ${entityId}`);
    }
  }

  /**
   * Create digital signature for data integrity
   */
  async createDigitalSignature(
    entityId: string,
    data: string | Buffer
  ): Promise<DigitalSignature> {
    const keyPair = this.keyStore.get(entityId);
    if (!keyPair) {
      throw new Error(`No key pair found for entity: ${entityId}`);
    }

    try {
      const dataString = typeof data === 'string' ? data : data.toString('base64');
      const sign = crypto.createSign('SHA256');
      sign.update(dataString);
      sign.end();

      const signature = sign.sign(keyPair.privateKey, 'hex');

      const digitalSignature: DigitalSignature = {
        signature,
        algorithm: 'SHA256withRSA',
        publicKey: keyPair.publicKey,
        timestamp: Date.now(),
        data: dataString
      };

      console.log(`Created digital signature for entity: ${entityId}`);
      return digitalSignature;
    } catch (error) {
      console.error('Digital signature creation failed:', error);
      throw new Error(`Failed to create signature for ${entityId}`);
    }
  }

  /**
   * Verify digital signature
   */
  async verifyDigitalSignature(
    signature: DigitalSignature,
    originalData: string | Buffer
  ): Promise<boolean> {
    try {
      const dataString = typeof originalData === 'string' ? originalData : originalData.toString('base64');
      
      if (dataString !== signature.data) {
        console.warn('Data mismatch in signature verification');
        return false;
      }

      const verify = crypto.createVerify('SHA256');
      verify.update(dataString);
      verify.end();

      const isValid = verify.verify(signature.publicKey, signature.signature, 'hex');
      
      console.log(`Signature verification result: ${isValid}`);
      return isValid;
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Register certificate in the PKI system
   */
  async registerCertificate(
    certificatePem: string,
    entityId: string
  ): Promise<CertificateInfo> {
    try {
      const cert = new X509Certificate(certificatePem);
      
      const certInfo: CertificateInfo = {
        serialNumber: cert.serialNumber,
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: new Date(cert.validFrom),
        validTo: new Date(cert.validTo),
        fingerprint: cert.fingerprint256,
        publicKey: cert.publicKey.toString(),
        isRevoked: false
      };

      this.certificateStore.set(entityId, certInfo);
      
      console.log(`Registered certificate for entity: ${entityId}`);
      return certInfo;
    } catch (error) {
      console.error('Certificate registration failed:', error);
      throw new Error(`Failed to register certificate for ${entityId}`);
    }
  }

  /**
   * Revoke a certificate and add to CRL
   */
  async revokeCertificate(
    entityId: string,
    reason: string = 'Compromised'
  ): Promise<boolean> {
    try {
      const certInfo = this.certificateStore.get(entityId);
      if (!certInfo) {
        throw new Error(`Certificate not found for entity: ${entityId}`);
      }

      // Update certificate info
      certInfo.isRevoked = true;
      certInfo.revokedAt = new Date();
      certInfo.revokedReason = reason;

      // Add to CRL
      this.crl.add(certInfo.serialNumber);

      // Persist CRL
      await this.saveCRL();

      console.log(`Revoked certificate for entity: ${entityId}, Reason: ${reason}`);
      return true;
    } catch (error) {
      console.error('Certificate revocation failed:', error);
      return false;
    }
  }

  /**
   * Check if certificate is revoked using CRL
   */
  isCertificateRevoked(serialNumber: string): boolean {
    return this.crl.has(serialNumber);
  }

  /**
   * Get Certificate Revocation List
   */
  getCRL(): string[] {
    return Array.from(this.crl);
  }

  /**
   * Encrypt data using public key
   */
  async encryptWithPublicKey(entityId: string, data: string): Promise<string> {
    const keyPair = this.keyStore.get(entityId);
    if (!keyPair) {
      throw new Error(`No key pair found for entity: ${entityId}`);
    }

    try {
      const dataBuffer = Buffer.from(data);
      const encrypted = crypto.publicEncrypt(
        {
          key: keyPair.publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        dataBuffer as any
      );

      return encrypted.toString('base64');
    } catch (error) {
      console.error('Public key encryption failed:', error);
      throw new Error(`Failed to encrypt data for ${entityId}`);
    }
  }

  /**
   * Decrypt data using private key
   */
  async decryptWithPrivateKey(entityId: string, encryptedData: string): Promise<string> {
    const keyPair = this.keyStore.get(entityId);
    if (!keyPair) {
      throw new Error(`No key pair found for entity: ${entityId}`);
    }

    try {
      const encryptedBuffer = Buffer.from(encryptedData, 'base64');
      const decrypted = crypto.privateDecrypt(
        {
          key: keyPair.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        encryptedBuffer as any
      );

      return decrypted.toString();
    } catch (error) {
      console.error('Private key decryption failed:', error);
      throw new Error(`Failed to decrypt data for ${entityId}`);
    }
  }

  /**
   * Rotate keys for an entity (security best practice)
   */
  async rotateKeys(entityId: string): Promise<KeyPair> {
    console.log(`Rotating keys for entity: ${entityId}`);
    
    // Generate new key pair
    const newKeyPair = await this.generateKeyPair(entityId, 2048, 365);
    
    // Archive old key pair (in production, implement secure archival)
    const oldKeyPair = this.keyStore.get(entityId);
    if (oldKeyPair) {
      await this.archiveKeyPair(entityId, oldKeyPair);
    }
    
    return newKeyPair;
  }

  /**
   * Store key pair securely (encrypted storage in production)
   */
  private async storeKeyPair(entityId: string, keyPair: KeyPair): Promise<void> {
    try {
      const keyPath = path.join(this.keyStorePath, `${entityId}.json`);
      // In production: encrypt before storing
      await fs.writeFile(keyPath, JSON.stringify({
        publicKey: keyPair.publicKey,
        // Note: Private key should be encrypted before storage
        privateKeyHash: crypto.createHash('sha256').update(keyPair.privateKey).digest('hex'),
        algorithm: keyPair.algorithm,
        keySize: keyPair.keySize,
        createdAt: keyPair.createdAt,
        expiresAt: keyPair.expiresAt
      }, null, 2));
    } catch (error) {
      console.error('Failed to store key pair:', error);
      throw error;
    }
  }

  /**
   * Archive old key pair
   */
  private async archiveKeyPair(entityId: string, keyPair: KeyPair): Promise<void> {
    const archivePath = path.join(this.keyStorePath, 'archive');
    await fs.mkdir(archivePath, { recursive: true });
    
    const archiveFile = path.join(archivePath, `${entityId}-${Date.now()}.json`);
    await fs.writeFile(archiveFile, JSON.stringify(keyPair, null, 2));
  }

  /**
   * Load Certificate Revocation List
   */
  private async loadCRL(): Promise<void> {
    try {
      const crlData = await fs.readFile(this.crlPath, 'utf8');
      const crlArray = JSON.parse(crlData);
      this.crl = new Set(crlArray);
    } catch (error) {
      // CRL file doesn't exist yet, start with empty CRL
      this.crl = new Set();
    }
  }

  /**
   * Save Certificate Revocation List
   */
  private async saveCRL(): Promise<void> {
    try {
      await fs.writeFile(this.crlPath, JSON.stringify(Array.from(this.crl), null, 2));
    } catch (error) {
      console.error('Failed to save CRL:', error);
    }
  }

  /**
   * Get system status and key information
   */
  getSystemStatus(): PKISystemStatus {
    const totalKeys = this.keyStore.size;
    const totalCerts = this.certificateStore.size;
    const revokedCerts = this.crl.size;
    
    const expiringSoon = Array.from(this.keyStore.entries())
      .filter(([_, keyPair]) => {
        const daysUntilExpiry = (keyPair.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        return daysUntilExpiry <= 30;
      })
      .map(([entityId, _]) => entityId);

    return {
      totalKeys,
      totalCertificates: totalCerts,
      revokedCertificates: revokedCerts,
      keysExpiringSoon: expiringSoon,
      systemHealth: expiringSoon.length === 0 ? 'HEALTHY' : 'WARNING'
    };
  }
}

export interface PKISystemStatus {
  totalKeys: number;
  totalCertificates: number;
  revokedCertificates: number;
  keysExpiringSoon: string[];
  systemHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

// Example usage and testing
export class PKITester {
  static async runTests(): Promise<void> {
    console.log('=== PKI Manager Tests ===');
    
    const pki = new PKIManager('./test-security-store');
    
    try {
      // Test 1: Generate key pair
      console.log('\n1. Testing key pair generation...');
      const keyPair = await pki.generateKeyPair('device-001', 2048);
      console.log('✓ Key pair generated successfully');
      
      // Test 2: Create and verify digital signature
      console.log('\n2. Testing digital signatures...');
      const testData = 'Important sensor data that needs integrity protection';
      const signature = await pki.createDigitalSignature('device-001', testData);
      const isValid = await pki.verifyDigitalSignature(signature, testData);
      console.log(`✓ Digital signature ${isValid ? 'verified' : 'failed'}`);
      
      // Test 3: Encryption/Decryption
      console.log('\n3. Testing encryption/decryption...');
      const encrypted = await pki.encryptWithPublicKey('device-001', 'Secret message');
      const decrypted = await pki.decryptWithPrivateKey('device-001', encrypted);
      console.log(`✓ Encryption/Decryption ${decrypted === 'Secret message' ? 'successful' : 'failed'}`);
      
      // Test 4: Certificate management
      console.log('\n4. Testing certificate management...');
      // Note: In real implementation, you'd have actual X.509 certificates
      
      // Test 5: System status
      console.log('\n5. Testing system status...');
      const status = pki.getSystemStatus();
      console.log('✓ System Status:', status);
      
    } catch (error) {
      console.error('PKI Test failed:', error);
    }
  }
}
