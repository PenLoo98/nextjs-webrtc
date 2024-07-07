'use client';
import React, { useState, useRef, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  addDoc
} from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

const Home: React.FC = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callId, setCallId] = useState<string>('');
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);

  const webcamVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);

  const webcamButton = useRef<HTMLButtonElement>(null);
  const callButton = useRef<HTMLButtonElement>(null);
  const answerButton = useRef<HTMLButtonElement>(null);
  const hangupButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const peerConnection = new RTCPeerConnection(servers);
    setPc(peerConnection);

    return () => {
      peerConnection.close();
    };
  }, []);

  useEffect(() => {
    if (webcamVideo.current && localStream) {
      webcamVideo.current.srcObject = localStream;
    }
    if (remoteVideo.current && remoteStream) {
      remoteVideo.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream]);

  const startWebcam = async () => {
    console.log('Starting webcam...');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    setRemoteStream(new MediaStream());

    if (pc) {
      // Push tracks from local stream to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Pull tracks from remote stream, add to video stream
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          if (remoteStream) remoteStream.addTrack(track);
        });
      };
    }

    if (callButton.current) callButton.current.disabled = false;
    if (answerButton.current) answerButton.current.disabled = false;
    if (webcamButton.current) webcamButton.current.disabled = true;
  };

  const createCall = async () => {
    if (!pc) return;
    console.log('Creating call...');

    const callDoc = doc(collection(firestore, 'calls'));
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    setCallId(callDoc.id);

    // Get candidates for caller, save to db
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(offerCandidates, event.candidate.toJSON());
      }
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await setDoc(callDoc, { offer });

    // Listen for remote answer
    onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (data && !pc.currentRemoteDescription && data.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    // When answered, add candidate to peer connection
    onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    if (hangupButton.current) hangupButton.current.disabled = false;
  };

  const answerCall = async () => {
    if (!pc) return;
    console.log('Answering call...');

    const callDoc = doc(firestore, 'calls', callId);
    const answerCandidates = collection(callDoc, 'answerCandidates');
    const offerCandidates = collection(callDoc, 'offerCandidates');

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(answerCandidates, event.candidate.toJSON());
      }
    };

    const callData = (await getDoc(callDoc)).data();

    if (callData) {
      const offerDescription = callData.offer;
      await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

      const answerDescription = await pc.createAnswer();
      await pc.setLocalDescription(answerDescription);

      const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
      };

      await updateDoc(callDoc, { answer });

      onSnapshot(offerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            pc.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });
    }
  };

  return (
    <main className="p-4">
      <h2 className="text-2xl font-bold mb-4">1. Start your Webcam</h2>
      <div className="videos flex space-x-4 mb-4">
        <span className="w-1/2">
          <h3 className="text-xl font-semibold mb-2">Local Stream</h3>
          <video ref={webcamVideo} className="w-full h-auto border rounded" autoPlay playsInline></video>
        </span>
        <span className="w-1/2">
          <h3 className="text-xl font-semibold mb-2">Remote Stream</h3>
          <video ref={remoteVideo} className="w-full h-auto border rounded" autoPlay playsInline></video>
        </span>
      </div>

      <button ref={webcamButton} onClick={startWebcam} className="bg-blue-500 text-white py-2 px-4 rounded mb-4">Start webcam</button>

      <h2 className="text-2xl font-bold mb-4">2. Create a new Call</h2>

      {/* disabled 원래 있었는데 지웠음*/}
      <button ref={callButton} onClick={createCall} className="bg-green-500 text-white py-2 px-4 rounded mb-4 disabled:opacity-50">Create Call (offer)</button>

      <h2 className="text-2xl font-bold mb-4">3. Join a Call</h2>
      <p className="mb-2">Answer the call from a different browser window or device</p>

      <input value={callId} onChange={(e) => setCallId(e.target.value)} className="border rounded py-2 px-4 mb-4 w-full" />

      {/* disabled 원래 있었는데 지웠음*/}
      <button ref={answerButton} onClick={answerCall} className="bg-yellow-500 text-white py-2 px-4 rounded mb-4 disabled:opacity-50">Answer</button>

      <h2 className="text-2xl font-bold mb-4">4. Hangup</h2>

      <button ref={hangupButton} disabled className="bg-red-500 text-white py-2 px-4 rounded disabled:opacity-50">Hangup</button>
    </main>
  );
};

export default Home;