import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  TrendingUp, 
  Activity, 
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  LineChart,
  Target,
  TrendingDown,
  Minus
} from 'lucide-react';
import axios from 'axios';

const LabAnalytics = () => {
  const { user } = useAuth();
  const [labValues, setLabValues] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTest, setSelectedTest] = useState('');
  const [viewMode, setViewMode] = useState('overview');
  const [extracting, setExtracting] = useState(false);
  const [trendData, setTrendData] = useState([]);
  const [analyticsSummary, setAnalyticsSummary] = useState(null);
  const [availableTests, setAvailableTests] = useState([]);
  const [groupedTrends, setGroupedTrends] = useState({});
  const [selectedTrendTest, setSelectedTrendTest] = useState('');

  useEffect(() => {
    fetchLabData();
    fetchGroupedTrends();
  }, []);

  useEffect(() => {
    if (selectedTrendTest) {
      fetchTrendData(selectedTrendTest);
    }
  }, [selectedTrendTest]);

  const fetchLabData = async () => {
    try {
      const [labResponse, categoriesResponse, summaryResponse, testsResponse] = await Promise.all([
        axios.get('/api/lab-values'),
        axios.get('/api/lab-categories'),
        axios.get('/api/lab-analytics/summary'),
        axios.get('/api/lab-values/test-names')
      ]);
      
      setLabValues(labResponse.data);
      setCategories(categoriesResponse.data);
      setAnalyticsSummary(summaryResponse.data);
      setAvailableTests(testsResponse.data);
    } catch (error) {
      console.error('Error fetching lab data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupedTrends = async () => {
    try {
      const response = await axios.get('/api/lab-values/grouped-trends');
      setGroupedTrends(response.data);
    } catch (error) {
      console.error('Error fetching grouped trends:', error);
    }
  };

  const reExtractLabData = async (recordId) => {
    setExtracting(true);
    try {
      await axios.post(`/api/lab-values/extract/${recordId}`);
      await fetchLabData();
      alert('Lab data re-extracted successfully!');
    } catch (error) {
      console.error('Error re-extracting lab data:', error);
      alert('Failed to re-extract lab data');
    } finally {
      setExtracting(false);
    }
  };

  const fetchTrendData = async (testName) => {
    try {
      const response = await axios.get(`/api/lab-values/trends/${testName}`);
      setTrendData(response.data);
    } catch (error) {
      console.error('Error fetching trend data:', error);
    }
  };

  const filteredLabValues = labValues.filter(lab => {
    const matchesCategory = selectedCategory === 'all' || lab.test_category === selectedCategory;
    const matchesTest = !selectedTest || lab.test_name.toLowerCase().includes(selectedTest.toLowerCase());
    return matchesCategory && matchesTest;
  });

  const testNames = [...new Set(labValues.map(lab => lab.test_name))].sort();

  const getCategoryStats = () => {
    const stats = {};
    labValues.forEach(lab => {
      if (!stats[lab.test_category]) {
        stats[lab.test_category] = {
          count: 0,
          abnormal: 0,
          normal: 0
        };
      }
      stats[lab.test_category].count++;
      if (lab.is_abnormal) {
        stats[lab.test_category].abnormal++;
      } else {
        stats[lab.test_category].normal++;
      }
    });
    return stats;
  };

  const categoryStats = getCategoryStats();

  const recentAbnormal = labValues
    .filter(lab => lab.is_abnormal)
    .sort((a, b) => new Date(b.test_date || b.upload_date) - new Date(a.test_date || a.upload_date))
    .slice(0, 5);

  const StatCard = ({ title, value, icon: Icon, color, subtitle, trend }) => (
    <div className={`bg-white p-6 rounded-lg shadow-md border-l-4 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <div className="flex items-center mt-2">
              {trend > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              ) : trend < 0 ? (
                <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
              ) : (
                <Minus className="h-4 w-4 text-gray-500 mr-1" />
              )}
              <span className={`text-sm ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {Math.abs(trend)}% from last month
              </span>
            </div>
          )}
        </div>
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
    </div>
  );

  // Enhanced trend chart with reference ranges
  const EnhancedTrendChart = ({ data, testName }) => {
    if (!data || data.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          No trend data available for {testName}
        </div>
      );
    }

    const sortedData = data.sort((a, b) => new Date(a.test_date || a.extraction_date) - new Date(b.test_date || b.extraction_date));
    
    // Calculate reference range if available
    const referenceRanges = sortedData
      .map(d => d.reference_range)
      .filter(Boolean)
      .map(range => {
        const match = range.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
        return match ? { min: parseFloat(match[1]), max: parseFloat(match[2]) } : null;
      })
      .filter(Boolean);
    
    const avgReference = referenceRanges.length > 0 ? {
      min: referenceRanges.reduce((sum, r) => sum + r.min, 0) / referenceRanges.length,
      max: referenceRanges.reduce((sum, r) => sum + r.max, 0) / referenceRanges.length
    } : null;

    const values = sortedData.map(d => Number(d.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <TrendingUp className="h-5 w-5 mr-2 text-medical-600" />
          {testName} Trend
        </h3>
        
        {/* Chart */}
        <div className="mb-6">
          <svg width="100%" height="200" className="border-b border-gray-200">
            {/* Reference range zone */}
            {avgReference && (
              <rect
                x="0"
                y={200 - ((avgReference.max - min) / range) * 180}
                width="100%"
                height={((avgReference.max - avgReference.min) / range) * 180}
                fill="#f0f9ff"
                opacity="0.5"
              />
            )}
            
            {/* Trend line */}
            <polyline
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="3"
              points={sortedData.map((d, i) => {
                const x = (i / (sortedData.length - 1)) * 95 + 2.5;
                const y = 190 - ((Number(d.value) - min) / range) * 180;
                return `${x},${y}`;
              }).join(' ')}
            />
            
            {/* Data points */}
            {sortedData.map((d, i) => {
              const x = (i / (sortedData.length - 1)) * 95 + 2.5;
              const y = 190 - ((Number(d.value) - min) / range) * 180;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="4"
                  fill={d.is_abnormal ? "#ef4444" : "#10b981"}
                  stroke="white"
                  strokeWidth="2"
                />
              );
            })}
            
            {/* Y-axis labels */}
            <text x="0" y="195" fontSize="10" fill="#888">{min}</text>
            <text x="0" y="15" fontSize="10" fill="#888">{max}</text>
            {avgReference && (
              <>
                <text x="0" y={200 - ((avgReference.max - min) / range) * 180 + 10} fontSize="10" fill="#0ea5e9">
                  {avgReference.max}
                </text>
                <text x="0" y={200 - ((avgReference.min - min) / range) * 180 + 10} fontSize="10" fill="#0ea5e9">
                  {avgReference.min}
                </text>
              </>
            )}
          </svg>
          
          {/* Reference range info */}
          {avgReference && (
            <div className="text-center mt-2">
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                Normal Range: {avgReference.min.toFixed(1)} - {avgReference.max.toFixed(1)} {data[0]?.unit}
              </span>
            </div>
          )}
        </div>

        {/* Data table */}
        <div className="space-y-3">
          {sortedData.map((item, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-4">
                <div className={`w-3 h-3 rounded-full ${item.is_abnormal ? 'bg-red-500' : 'bg-green-500'}`}></div>
                <div>
                  <p className="font-medium text-gray-900">{item.value} {item.unit}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(item.test_date || item.extraction_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">{item.record_name}</p>
                {item.reference_range && (
                  <p className="text-xs text-gray-500">Ref: {item.reference_range}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Simple SVG line chart for trends
  const SimpleLineChart = ({ data, testName }) => {
    if (!data || data.length < 2) return <div className="text-gray-500">Not enough data for a trend graph.</div>;
    
    // Sort by date
    const sorted = [...data].sort((a, b) => new Date(a.test_date || a.upload_date) - new Date(b.test_date || b.upload_date));
    const values = sorted.map(d => Number(d.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * 180 + 10;
      const y = 90 - ((v - min) / range) * 70;
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <div className="relative">
        <svg width="200" height="100" className="my-2">
          {/* Reference range if available */}
          {sorted[0]?.reference_range && (() => {
            const rangeMatch = sorted[0].reference_range.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
            if (rangeMatch) {
              const refMin = parseFloat(rangeMatch[1]);
              const refMax = parseFloat(rangeMatch[2]);
              const y1 = 90 - ((refMin - min) / range) * 70;
              const y2 = 90 - ((refMax - min) / range) * 70;
              return (
                <rect
                  x="0"
                  y={Math.min(y1, y2)}
                  width="200"
                  height={Math.abs(y2 - y1)}
                  fill="#f0f9ff"
                  opacity="0.5"
                />
              );
            }
            return null;
          })()}
          
          <polyline
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="2"
            points={points}
          />
          
          {/* Dots */}
          {values.map((v, i) => {
            const x = (i / (values.length - 1)) * 180 + 10;
            const y = 90 - ((v - min) / range) * 70;
            return (
              <circle 
                key={i} 
                cx={x} 
                cy={y} 
                r="3" 
                fill={sorted[i].is_abnormal ? "#ef4444" : "#10b981"} 
              />
            );
          })}
          
          {/* Min/Max labels */}
          <text x="0" y="95" fontSize="10" fill="#888">{min}</text>
          <text x="170" y="95" fontSize="10" fill="#888" textAnchor="end">{max}</text>
        </svg>
        
        {/* Reference range label */}
        {sorted[0]?.reference_range && (
          <div className="text-xs text-blue-600 text-center mt-1">
            Normal: {sorted[0].reference_range}
          </div>
        )}
      </div>
    );
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
        <h1 className="text-3xl font-bold text-gray-900">Lab Analytics</h1>
        <p className="mt-2 text-gray-600">
          Track your laboratory values over time and monitor trends with AI-powered insights
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Tests"
          value={labValues.length}
          icon={Activity}
          color="border-blue-500"
        />
        <StatCard
          title="Abnormal Results"
          value={labValues.filter(lab => lab.is_abnormal).length}
          icon={AlertTriangle}
          color="border-red-500"
          subtitle={`${((labValues.filter(lab => lab.is_abnormal).length / labValues.length) * 100).toFixed(1)}% of total`}
        />
        <StatCard
          title="Test Categories"
          value={Object.keys(categoryStats).length}
          icon={Filter}
          color="border-green-500"
        />
        <StatCard
          title="Recent Tests"
          value={labValues.filter(lab => {
            const testDate = new Date(lab.test_date || lab.upload_date);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return testDate > weekAgo;
          }).length}
          icon={Clock}
          color="border-purple-500"
          subtitle="Last 7 days"
        />
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex space-x-2">
            <button
              onClick={() => setViewMode('overview')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
                viewMode === 'overview' 
                  ? 'bg-medical-100 text-medical-700 border border-medical-200' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Activity className="h-4 w-4 inline mr-2" />
              Overview
            </button>
            <button
              onClick={() => setViewMode('categories')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
                viewMode === 'categories' 
                  ? 'bg-medical-100 text-medical-700 border border-medical-200' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Filter className="h-4 w-4 inline mr-2" />
              Categories
            </button>
            <button
              onClick={() => setViewMode('trends')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
                viewMode === 'trends' 
                  ? 'bg-medical-100 text-medical-700 border border-medical-200' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <LineChart className="h-4 w-4 inline mr-2" />
              Trends
            </button>
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-medical-500"
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option key={category.category_name} value={category.category_name}>
                {category.category_name}
              </option>
            ))}
          </select>

          <select
            value={selectedTest}
            onChange={(e) => setSelectedTest(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-medical-500"
          >
            <option value="">All Tests</option>
            {testNames.map(testName => (
              <option key={testName} value={testName}>
                {testName}
              </option>
            ))}
          </select>

          <button
            onClick={fetchLabData}
            disabled={extracting}
            className="flex items-center px-4 py-2 bg-medical-600 text-white rounded-md hover:bg-medical-700 disabled:opacity-50 transition-colors duration-200"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${extracting ? 'animate-spin' : ''}`} />
            {extracting ? 'Extracting...' : 'Refresh'}
          </button>
        </div>
      </div>

      {viewMode === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Test Distribution by Category
            </h3>
            <div className="space-y-4">
              {Object.entries(categoryStats).map(([category, stats]) => (
                <div key={category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{category}</p>
                    <p className="text-sm text-gray-600">{stats.count} tests</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">
                      {stats.abnormal} abnormal, {stats.normal} normal
                    </p>
                    <div className="w-24 bg-gray-200 rounded-full h-2 mt-1">
                      <div 
                        className="bg-medical-600 h-2 rounded-full" 
                        style={{ width: `${(stats.count / labValues.length) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Recent Abnormal Results
            </h3>
            {recentAbnormal.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No abnormal results found</p>
            ) : (
              <div className="space-y-3">
                {recentAbnormal.map((lab, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{lab.test_name}</p>
                      <p className="text-sm text-gray-600">
                        {lab.value} {lab.unit} • {new Date(lab.test_date || lab.upload_date).toLocaleDateString()}
                      </p>
                    </div>
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'categories' && (
        <div className="space-y-6">
          {categories.map(category => {
            const categoryData = labValues.filter(lab => lab.test_category === category.category_name);
            if (categoryData.length === 0) return null;

            return (
              <div key={category.category_name} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {category.category_name}
                  </h3>
                  <span className="text-sm text-gray-500">
                    {categoryData.length} tests
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryData.slice(0, 6).map((lab, index) => (
                    <div key={index} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{lab.test_name}</h4>
                        {lab.is_abnormal ? (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                      <p className="text-lg font-bold text-gray-900">
                        {lab.value} {lab.unit}
                      </p>
                      <p className="text-sm text-gray-600">
                        {lab.reference_range && `Normal: ${lab.reference_range}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(lab.test_date || lab.upload_date).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
                
                {categoryData.length > 6 && (
                  <p className="text-sm text-gray-500 mt-4 text-center">
                    +{categoryData.length - 6} more tests
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'trends' && (
        <div className="space-y-8">
          {/* Test selector for detailed trend view */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Test for Detailed Trend</h3>
            <select
              value={selectedTrendTest}
              onChange={(e) => setSelectedTrendTest(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-medical-500 w-full md:w-64"
            >
              <option value="">Choose a test...</option>
              {testNames.map(testName => (
                <option key={testName} value={testName}>
                  {testName}
                </option>
              ))}
            </select>
          </div>

          {/* Detailed trend chart */}
          {selectedTrendTest && (
            <EnhancedTrendChart data={trendData} testName={selectedTrendTest} />
          )}

          {/* Grouped trends overview */}
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-900">All Test Trends</h3>
            {Object.keys(groupedTrends).length === 0 && (
              <div className="text-gray-500">No lab trend data available.</div>
            )}
            {Object.entries(groupedTrends).map(([recordType, tests]) => (
              <div key={recordType} className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <LineChart className="h-5 w-5 mr-2 text-medical-600" />
                  {recordType || 'Unknown Record Type'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.entries(tests).map(([testName, data]) => (
                    <div key={testName} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{testName}</h4>
                        <span className="text-xs text-gray-500">{data.length} pts</span>
                      </div>
                      <SimpleLineChart data={data} testName={testName} />
                      <div className="text-xs text-gray-500 mt-2">
                        {data[data.length-1]?.unit}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6 mt-8">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">All Lab Values</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Test
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLabValues.map((lab, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {lab.test_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {lab.test_category}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {lab.value} {lab.unit}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {lab.reference_range || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {lab.is_abnormal ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Abnormal
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Normal
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(lab.test_date || lab.upload_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => reExtractLabData(lab.record_id)}
                      disabled={extracting}
                      className="text-medical-600 hover:text-medical-900 disabled:opacity-50"
                      title="Re-extract lab data"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LabAnalytics;
