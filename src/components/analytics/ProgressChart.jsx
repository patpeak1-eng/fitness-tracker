import React from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass-panel" style={{ padding: '10px', fontSize: '0.85rem' }}>
                <p style={{ margin: 0, fontWeight: 600, color: '#fff' }}>{label}</p>
                <p style={{ margin: 0, color: payload[0].color }}>
                    {payload[0].value} {payload[0].unit}
                </p>
            </div>
        );
    }
    return null;
};

const ProgressChart = ({ type = 'bar', data, dataKey, color = '#bfff00', height = 250, unit = '' }) => {
    // Inject unit into payload for tooltip
    const chartData = data.map(item => ({ ...item, unit }));

    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
                {type === 'bar' ? (
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                            dataKey="name"
                            tick={{ fontSize: 12, fill: '#a0a0a0' }}
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        <Bar
                            dataKey={dataKey}
                            fill={color}
                            radius={[4, 4, 0, 0]}
                            animationDuration={1500}
                        />
                    </BarChart>
                ) : (
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                            dataKey="name"
                            tick={{ fontSize: 12, fill: '#a0a0a0' }}
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                        />
                        <YAxis hide domain={['dataMin', 'auto']} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line
                            type="monotone"
                            dataKey={dataKey}
                            stroke={color}
                            strokeWidth={3}
                            dot={{ fill: '#1e1e1e', stroke: color, strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6, fill: color }}
                            animationDuration={1500}
                        />
                    </LineChart>
                )}
            </ResponsiveContainer>
        </div>
    );
};

export default ProgressChart;
