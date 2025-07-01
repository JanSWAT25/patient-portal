import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  FileText, 
  Search, 
  Filter, 
  Download,
  User,
  Shield
} from 'lucide-react';
import axios from 'axios';

const Records = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      const response = await axios.get('/api/records');
      setRecords(response.data);
    } catch (error) {
      console.error('Error fetching records:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = records.filter(record => {
    const matchesSearch = record.original_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (record.record_type && record.record_type.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterType === 'all' || record.record_type === filterType;
    return matchesSearch && matchesFilter;
  });

  const recordTypes = ['all', ...Array.from(new Set(records.map(r => r.record_type).filter(Boolean)))];

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-medical-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Medical Records</h1>
        <p className="mt-2 text-gray-600">
          View and manage all your uploaded medical documents
        </p>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search records..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-medical-500 focus:border-medical-500"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-medical-500 focus:border-medical-500"
            >
              {recordTypes.map((type) => (
                <option key={type} value={type}>
                  {type === 'all' ? 'All Types' : type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Records List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Records</h2>
        {filteredRecords.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No records found.</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredRecords.map((record) => (
              <li key={record.id} className="flex flex-col md:flex-row md:items-center justify-between py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-6 w-6 text-medical-600 flex-shrink-0" />
                    <span className="font-medium text-gray-900 truncate">{record.original_name}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-500 flex flex-wrap gap-4">
                    <span>{record.record_type || 'Unknown Type'}</span>
                    <span>{formatDate(record.upload_date)}</span>
                    <span>Size: {formatFileSize(record.file_size)}</span>
                    {record.uploaded_by_username && (
                      <span className="flex items-center">
                        {record.uploaded_by_username === user?.username ? (
                          <>
                            <User className="h-3 w-3 mr-1" />
                            Uploaded by you
                          </>
                        ) : (
                          <>
                            <Shield className="h-3 w-3 mr-1" />
                            Uploaded by admin
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 md:mt-0 md:ml-6 flex-shrink-0">
                  <a
                    href={`/api/pdf/${record.filename}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 border border-medical-300 text-sm font-medium rounded-md text-medical-700 bg-medical-50 hover:bg-medical-100"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Summary Stats */}
      {records.length > 0 && (
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-medical-600">{records.length}</div>
              <div className="text-sm text-gray-600">Total Records</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-medical-600">
                {formatFileSize(records.reduce((sum, r) => sum + r.file_size, 0))}
              </div>
              <div className="text-sm text-gray-600">Total Size</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-medical-600">
                {recordTypes.length - 1}
              </div>
              <div className="text-sm text-gray-600">Record Types</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-medical-600">
                {records.filter(r => {
                  const uploadDate = new Date(r.upload_date);
                  const weekAgo = new Date();
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return uploadDate > weekAgo;
                }).length}
              </div>
              <div className="text-sm text-gray-600">This Week</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Records; 