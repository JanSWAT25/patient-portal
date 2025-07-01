import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  FileText, 
  UserPlus, 
  Settings,
  Eye,
  Trash2,
  Shield,
  BarChart3,
  Activity,
  Calendar,
  Upload,
  Download
} from 'lucide-react';
import axios from 'axios';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalRecords: 0,
    recentUsers: 0,
    recentRecords: 0
  });
  const [users, setUsers] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadData, setUploadData] = useState({
    user_id: '',
    record_type: '',
    files: []
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      const [usersResponse, recordsResponse] = await Promise.all([
        axios.get('/api/admin/users'),
        axios.get('/api/admin/records')
      ]);

      const usersData = usersResponse.data;
      const recordsData = recordsResponse.data;

      // Calculate stats
      const recentUsers = usersData.filter(user => {
        const createdDate = new Date(user.created_at);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return createdDate > weekAgo;
      }).length;

      const recentRecords = recordsData.filter(record => {
        const uploadDate = new Date(record.upload_date);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return uploadDate > weekAgo;
      }).length;

      setStats({
        totalUsers: usersData.length,
        totalRecords: recordsData.length,
        recentUsers,
        recentRecords
      });

      setUsers(usersData);
      setRecords(recordsData);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await axios.put(`/api/admin/users/${userId}/role`, { role: newRole });
      fetchAdminData(); // Refresh data
    } catch (error) {
      console.error('Error updating user role:', error);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user? This will also delete all their records.')) {
      try {
        await axios.delete(`/api/admin/users/${userId}`);
        fetchAdminData(); // Refresh data
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    
    if (!uploadData.user_id || !uploadData.record_type || uploadData.files.length === 0) {
      alert('Please fill in all fields and select at least one file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    
    // Add all files to form data
    uploadData.files.forEach(file => {
      formData.append('pdf', file);
    });
    
    formData.append('user_id', uploadData.user_id);
    formData.append('record_type', uploadData.record_type);

    try {
      const response = await axios.post('/api/admin/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      const { successful, failed } = response.data;
      if (failed === 0) {
        alert(`Successfully uploaded ${successful} file${successful > 1 ? 's' : ''}!`);
      } else {
        alert(`Uploaded ${successful} file${successful > 1 ? 's' : ''}, ${failed} failed.`);
      }
      
      setShowUploadModal(false);
      setUploadData({ user_id: '', record_type: '', files: [] });
      fetchAdminData(); // Refresh data
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed: ' + (error.response?.data?.error || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, description }) => (
    <div className={`bg-white p-6 rounded-lg shadow-md border-l-4 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
        </div>
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
    </div>
  );

  const TabButton = ({ id, title, icon: Icon, isActive }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
        isActive 
          ? 'bg-medical-100 text-medical-700 border border-medical-200' 
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      <Icon className="h-5 w-5 mr-2" />
      {title}
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-medical-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Admin Dashboard
            </h1>
            <p className="mt-2 text-gray-600">
              Manage users and monitor system activity
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Shield className="h-6 w-6 text-medical-600" />
            <span className="text-sm font-medium text-medical-600">Administrator</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={Users}
          color="border-blue-500"
          description={`${stats.recentUsers} new this week`}
        />
        <StatCard
          title="Total Records"
          value={stats.totalRecords}
          icon={FileText}
          color="border-green-500"
          description={`${stats.recentRecords} uploaded this week`}
        />
        <StatCard
          title="Admin Users"
          value={users.filter(u => u.role === 'admin').length}
          icon={Shield}
          color="border-purple-500"
        />
        <StatCard
          title="Regular Users"
          value={users.filter(u => u.role === 'user').length}
          icon={UserPlus}
          color="border-orange-500"
        />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex space-x-4">
            <TabButton
              id="overview"
              title="Overview"
              icon={BarChart3}
              isActive={activeTab === 'overview'}
            />
            <TabButton
              id="users"
              title="User Management"
              icon={Users}
              isActive={activeTab === 'users'}
            />
            <TabButton
              id="records"
              title="All Records"
              icon={FileText}
              isActive={activeTab === 'records'}
            />
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center px-4 py-2 rounded-lg font-medium bg-medical-600 text-white hover:bg-medical-700 transition-colors duration-200"
            >
              <Upload className="h-5 w-5 mr-2" />
              Upload File
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">New users this week</span>
                      <span className="font-medium">{stats.recentUsers}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">New records this week</span>
                      <span className="font-medium">{stats.recentRecords}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setActiveTab('users')}
                      className="w-full text-left px-3 py-2 text-sm text-medical-600 hover:bg-medical-50 rounded-md transition-colors duration-200"
                    >
                      Manage Users
                    </button>
                    <button
                      onClick={() => setActiveTab('records')}
                      className="w-full text-left px-3 py-2 text-sm text-medical-600 hover:bg-medical-50 rounded-md transition-colors duration-200"
                    >
                      View All Records
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">User Management</h3>
                <span className="text-sm text-gray-500">{users.length} total users</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Records
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => {
                      const userRecords = records.filter(r => r.user_id === user.id);
                      return (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <select
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              className="text-sm border border-gray-300 rounded-md px-2 py-1"
                              disabled={user.username === 'admin'} // Prevent changing admin role
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {userRecords.length}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => {
                                  // Navigate to user records view
                                  setActiveTab('records');
                                  // You could add filtering here
                                }}
                                className="text-medical-600 hover:text-medical-900"
                                title="View Records"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              {user.username !== 'admin' && (
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="text-red-600 hover:text-red-900"
                                  title="Delete User"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Records Tab */}
          {activeTab === 'records' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">All Medical Records</h3>
                <span className="text-sm text-gray-500">{records.length} total records</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Record
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Upload Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {records.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{record.full_name}</div>
                            <div className="text-sm text-gray-500">{record.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{record.original_name}</div>
                          <div className="text-sm text-gray-500">{(record.file_size / 1024 / 1024).toFixed(2)} MB</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-medical-100 text-medical-800">
                            {record.record_type || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(record.upload_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <a
                            href={`/api/pdf/${record.filename}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-medical-600 hover:text-medical-900"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Upload Files for User</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleFileUpload}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select User
                  </label>
                  <select
                    value={uploadData.user_id}
                    onChange={(e) => setUploadData({...uploadData, user_id: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-medical-500"
                    required
                  >
                    <option value="">Choose a user...</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.full_name} ({user.username})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Record Type
                  </label>
                  <select
                    value={uploadData.record_type}
                    onChange={(e) => setUploadData({...uploadData, record_type: e.target.value})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-medical-500"
                    required
                  >
                    <option value="">Select record type...</option>
                    <option value="ECG">ECG</option>
                    <option value="Echocardiography">Echocardiography</option>
                    <option value="CT Scan">CT Scan</option>
                    <option value="MRI">MRI</option>
                    <option value="Blood Test">Blood Test</option>
                    <option value="X-Ray">X-Ray</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PDF Files (up to 10)
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={(e) => setUploadData({...uploadData, files: Array.from(e.target.files)})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-medical-500"
                    required
                  />
                  {uploadData.files.length > 0 && (
                    <div className="mt-2 text-sm text-gray-600">
                      Selected {uploadData.files.length} file{uploadData.files.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 text-sm font-medium text-white bg-medical-600 rounded-md hover:bg-medical-700 disabled:opacity-50 transition-colors duration-200"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard; 