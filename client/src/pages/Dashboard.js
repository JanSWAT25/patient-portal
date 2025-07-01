import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  FileText, 
  Upload as UploadIcon, 
  Activity, 
  Calendar,
  TrendingUp,
  Heart,
  Eye,
  BarChart3
} from 'lucide-react';
import axios from 'axios';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalRecords: 0,
    recentUploads: 0,
    recordTypes: {}
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const response = await axios.get('/api/records');
      const records = response.data;
      
      const recordTypes = records.reduce((acc, record) => {
        const type = record.record_type || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      const recentUploads = records.filter(record => {
        const uploadDate = new Date(record.upload_date);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return uploadDate > weekAgo;
      }).length;

      setStats({
        totalRecords: records.length,
        recentUploads,
        recordTypes
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, link }) => {
    const content = (
      <div className={`bg-white p-6 rounded-lg shadow-md border-l-4 ${color} hover:shadow-lg transition-shadow duration-200`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
          <Icon className="h-8 w-8 text-gray-400" />
        </div>
      </div>
    );

    return link ? (
      <Link to={link} className="block">
        {content}
      </Link>
    ) : content;
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
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.full_name || user?.username}!
        </h1>
        <p className="mt-2 text-gray-600">
          Here's an overview of your medical records and recent activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Records"
          value={stats.totalRecords}
          icon={FileText}
          color="border-blue-500"
          link="/records"
        />
        <StatCard
          title="Recent Uploads"
          value={stats.recentUploads}
          icon={Upload}
          color="border-green-500"
          link="/records"
        />
        <StatCard
          title="Record Types"
          value={Object.keys(stats.recordTypes).length}
          icon={BarChart3}
          color="border-purple-500"
        />
        <StatCard
          title="Health Score"
          value="85%"
          icon={Heart}
          color="border-red-500"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/upload"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-medical-300 hover:bg-medical-50 transition-colors duration-200"
          >
            <Upload className="h-6 w-6 text-medical-600 mr-3" />
            <div>
              <h3 className="font-medium text-gray-900">Upload New Record</h3>
              <p className="text-sm text-gray-600">Add a new medical document</p>
            </div>
          </Link>
          
          <Link
            to="/records"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-medical-300 hover:bg-medical-50 transition-colors duration-200"
          >
            <Eye className="h-6 w-6 text-medical-600 mr-3" />
            <div>
              <h3 className="font-medium text-gray-900">View Records</h3>
              <p className="text-sm text-gray-600">Browse your medical history</p>
            </div>
          </Link>
          
          <div className="flex items-center p-4 border border-gray-200 rounded-lg bg-gray-50">
            <TrendingUp className="h-6 w-6 text-gray-400 mr-3" />
            <div>
              <h3 className="font-medium text-gray-900">Analytics</h3>
              <p className="text-sm text-gray-600">Coming soon</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
        {stats.totalRecords === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No records yet</h3>
            <p className="text-gray-600 mb-4">Start by uploading your first medical record</p>
            <Link
              to="/upload"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-medical-600 hover:bg-medical-700 transition-colors duration-200"
            >
              <UploadIcon className="h-4 w-4 mr-2" />
              Upload First Record
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <Activity className="h-5 w-5 text-medical-600 mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Records Overview</p>
                  <p className="text-sm text-gray-600">
                    {stats.totalRecords} total records • {stats.recentUploads} uploaded this week
                  </p>
                </div>
              </div>
              <Calendar className="h-5 w-5 text-gray-400" />
            </div>
            
            {Object.entries(stats.recordTypes).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center">
                  <FileText className="h-5 w-5 text-medical-600 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900">{type}</p>
                    <p className="text-sm text-gray-600">{count} record{count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <Link
                  to="/records"
                  className="text-medical-600 hover:text-medical-700 text-sm font-medium"
                >
                  View →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard; 