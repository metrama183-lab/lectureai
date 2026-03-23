// components/ErrorBoundary.jsx — catches React rendering errors
// Prevents the entire app from going white if a component crashes

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '16px',
          padding: '40px',
          background: '#0a0e1a',
          color: 'rgba(255,255,255,0.9)',
          fontFamily: 'Inter, sans-serif',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Something went wrong</h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', maxWidth: '400px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '10px 24px',
              borderRadius: '12px',
              border: '1px solid rgba(99,102,241,0.4)',
              background: 'rgba(99,102,241,0.15)',
              color: '#818cf8',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
