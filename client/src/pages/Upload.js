import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload as UploadIcon, FileText, AlertCircle, CheckCircle, X, Check, XCircle } from 'lucide-react';
import axios from 'axios';

const Upload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [recordType, setRecordType] = useState('');
  const [uploadProgress, setUploadProgress] = useState([]);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!recordType) {
      setUploadStatus({ type: 'error', message: 'Please select a record type first' });
      return;
    }

    setUploading(true);
    setUploadStatus(null);
    setUploadProgress([]);

    try {
      const formData = new FormData();
      
      // Add all files to form data
      acceptedFiles.forEach(file => {
        formData.append('pdf', file);
      });
      
      formData.append('record_type', recordType);

      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Process results
      const { successful, failed, results, errors } = response.data;
      
      if (failed === 0) {
        setUploadStatus({
          type: 'success',
          message: `Successfully uploaded ${successful} file${successful > 1 ? 's' : ''}`,
          data: response.data
        });
      } else {
        setUploadStatus({
          type: 'partial',
          message: `Uploaded ${successful} file${successful > 1 ? 's' : ''}, ${failed} failed`,
          data: response.data
        });
      }

      // Set progress for individual files
      const progress = [];
      results.forEach(result => {
        progress.push({
          filename: result.filename,
          status: 'success',
          message: 'Uploaded successfully'
        });
      });
      errors.forEach(error => {
        progress.push({
          filename: error.filename,
          status: 'error',
          message: error.error
        });
      });
      setUploadProgress(progress);

    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: error.response?.data?.error || 'Upload failed'
      });
    } finally {
      setUploading(false);
    }
  }, [recordType]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true
  });

  const recordTypes = [
    'ECG',
    'Echocardiography',
    'CT Scan',
    'MRI Scan',
    'Blood Test',
    'Lab Results',
    'X-Ray',
    'Ultrasound',
    'Other'
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Upload Medical Records</h1>
        <p className="mt-2 text-gray-600">
          Upload your medical documents in PDF format. We'll extract and analyze the data for you.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        {/* Record Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Record Type
          </label>
          <select
            value={recordType}
            onChange={(e) => setRecordType(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-medical-500 focus:border-medical-500"
          >
            <option value="">Select a record type</option>
            {recordTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Upload Area */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors duration-200 ${
            isDragActive
              ? 'border-medical-400 bg-medical-50'
              : 'border-gray-300 hover:border-medical-400 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <UploadIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          {isDragActive ? (
            <p className="text-medical-600 font-medium">Drop PDF files here...</p>
          ) : (
            <div>
              <p className="text-gray-600 mb-2">
                Drag and drop PDF files here, or click to select
              </p>
              <p className="text-sm text-gray-500">
                Only PDF files are supported (max 10 files, 10MB each)
              </p>
            </div>
          )}
        </div>

        {/* Upload Status */}
        {uploadStatus && (
          <div className={`mt-4 p-4 rounded-md ${
            uploadStatus.type === 'success' 
              ? 'bg-green-50 border border-green-200' 
              : uploadStatus.type === 'partial'
              ? 'bg-yellow-50 border border-yellow-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center">
              {uploadStatus.type === 'success' ? (
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              ) : uploadStatus.type === 'partial' ? (
                <AlertCircle className="h-5 w-5 text-yellow-500 mr-2" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              )}
              <span className={`text-sm ${
                uploadStatus.type === 'success' ? 'text-green-700' : 
                uploadStatus.type === 'partial' ? 'text-yellow-700' : 'text-red-700'
              }`}>
                {uploadStatus.message}
              </span>
            </div>
          </div>
        )}

        {/* Individual File Progress */}
        {uploadProgress.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Upload Results:</h4>
            {uploadProgress.map((file, index) => (
              <div key={index} className={`flex items-center justify-between p-3 rounded-md ${
                file.status === 'success' 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center">
                  {file.status === 'success' ? (
                    <Check className="h-4 w-4 text-green-500 mr-2" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 mr-2" />
                  )}
                  <span className="text-sm font-medium text-gray-900">{file.filename}</span>
                </div>
                <span className={`text-xs ${
                  file.status === 'success' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {file.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Loading State */}
        {uploading && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-sm text-blue-700">Uploading and processing your document...</span>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Upload Guidelines</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Supported Formats</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• PDF files only</li>
              <li>• Maximum 10 files at once</li>
              <li>• Maximum file size: 10MB each</li>
              <li>• Clear, readable documents</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Recommended Documents</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Lab test results</li>
              <li>• Medical imaging reports</li>
              <li>• Doctor's notes</li>
              <li>• Prescription information</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Upload; 