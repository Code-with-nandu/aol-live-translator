import React, { useState, useEffect } from 'react';
import { AppRole } from './types';
import { Navbar } from './components/Navbar';
import { TeacherView } from './components/TeacherView';
import { StudentView } from './components/StudentView';
import { MultiStudentSim } from './components/MultiStudentSim';
import { SetupGuideModal } from './components/SetupGuideModal';

export default function App() {
  const [role, setRole] = useState<AppRole>('teacher');
  const [sessionId, setSessionId] = useState<string>('AOL-108');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Parse URL search params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    const roleParam = params.get('role');

    if (sessionParam) {
      setSessionId(sessionParam.trim().toUpperCase());
      // If someone arrived via a session link without explicitly specifying role=teacher, default to student
      if (roleParam === 'teacher') {
        setRole('teacher');
      } else if (roleParam === 'simulator') {
        setRole('simulator');
      } else {
        setRole('student');
      }
    } else if (roleParam === 'student') {
      setRole('student');
    } else if (roleParam === 'simulator') {
      setRole('simulator');
    }
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-stone-950 font-sans text-stone-100">
      {/* Top Navbar */}
      <Navbar
        currentRole={role}
        onChangeRole={(newRole) => setRole(newRole)}
        sessionId={sessionId}
        onOpenGuide={() => setIsGuideOpen(true)}
      />

      {/* Main Views */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {role === 'teacher' && (
          <TeacherView
            sessionId={sessionId}
            onOpenGuide={() => setIsGuideOpen(true)}
            onOpenSimulator={() => setRole('simulator')}
          />
        )}

        {role === 'student' && (
          <StudentView
            sessionId={sessionId}
            onOpenGuide={() => setIsGuideOpen(true)}
            onLeaveSession={() => setRole('teacher')}
          />
        )}

        {role === 'simulator' && (
          <MultiStudentSim
            sessionId={sessionId}
            onBackToTeacher={() => setRole('teacher')}
            onOpenGuide={() => setIsGuideOpen(true)}
          />
        )}
      </div>

      {/* Setup & Cost Guide Modal */}
      <SetupGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />
    </div>
  );
}
