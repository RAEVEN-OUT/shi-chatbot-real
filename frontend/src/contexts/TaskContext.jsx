'use client';
import React, { createContext, useContext, useState } from 'react';

const TaskContext = createContext();

export function useTasks() {
  return useContext(TaskContext);
}

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState([]);

  const addTask = (id, title, status = 'processing', meta = {}) => {
    setTasks(prev => [...prev.filter(t => t.id !== id), { id, title, status, progress: 0, ...meta }]);
  };

  const updateTask = (id, updates) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const removeTask = (id) => {
    // wait a moment before removing so user sees completion
    setTimeout(() => {
       setTasks(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  return (
    <TaskContext.Provider value={{ tasks, addTask, updateTask, removeTask }}>
      {children}
    </TaskContext.Provider>
  );
}
