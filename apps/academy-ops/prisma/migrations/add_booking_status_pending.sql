-- Feature: 스터디룸 학생 예약 신청 - PENDING 상태 추가

ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PENDING';
