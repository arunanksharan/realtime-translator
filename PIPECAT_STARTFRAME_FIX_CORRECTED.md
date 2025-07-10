# Pipecat StartFrame Fix - CORRECTED

## Issue
The pipeline was failing with:
```
ERROR: StartFrame.__init__() got an unexpected keyword argument 'metadata'
```

## Root Cause
I incorrectly tried to manually create a StartFrame with metadata. In Pipecat:
- The PipelineTask automatically creates and sends a StartFrame when it starts
- StartFrame doesn't accept custom parameters like metadata
- The StartFrame is created internally by PipelineTask with the task manager

## Correct Fix

### 1. Use PipelineParams
Instead of manually creating a StartFrame, configure the pipeline using PipelineParams:

```python
from pipecat.pipeline.task import PipelineTask, PipelineParams

# Create pipeline task with proper params
self.pipeline_tasks[direction] = PipelineTask(
    self.pipelines[direction],
    params=PipelineParams(
        audio_in_sample_rate=16000,
        audio_out_sample_rate=16000,
        allow_interruptions=True,
        enable_metrics=True,
        enable_usage_metrics=True
    )
)
```

### 2. Let PipelineTask Handle StartFrame
The PipelineRunner will automatically:
1. Create a StartFrame with the task manager
2. Send it through the pipeline
3. Initialize all processors

```python
# Just run the pipeline - StartFrame is handled automatically
self.runner_tasks[direction] = asyncio.create_task(
    self.pipeline_runners[direction].run(self.pipeline_tasks[direction])
)
```

### 3. Processors Still Need to Handle StartFrame
All custom processors should still check for StartFrame:

```python
async def process_frame(self, frame, direction=None):
    # Handle StartFrame to know when pipeline is initialized
    if isinstance(frame, StartFrame):
        self._started = True
        logger.info(f"Processor initialized")
        await self.push_frame(frame, direction)
        return
        
    # Don't process until initialized
    if not self._started:
        await self.push_frame(frame, direction)
        return
    
    # Normal processing...
```

## Files Modified
1. `/backend/app/services/pipeline_manager.py`:
   - Added PipelineParams import
   - Set PipelineParams for both pipelines (A→B and B→A)
   - Removed manual StartFrame creation
   - Kept StartFrame handling in processors

2. `/backend/app/services/transcription_processor.py`:
   - Kept StartFrame handling in all processors

## Key Learnings
- Don't manually create StartFrame - let PipelineTask do it
- Use PipelineParams to configure pipeline settings
- StartFrame is automatically sent when the pipeline starts
- Processors should still handle StartFrame for initialization

This aligns with Pipecat's architecture where the framework manages the pipeline lifecycle.
