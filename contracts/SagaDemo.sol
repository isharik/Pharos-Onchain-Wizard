// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A small Atlantic testnet fixture for demonstrating a receipt-gated saga.
/// @dev Each transition requires the previous confirmed on-chain state. Only the
///      wallet that started a run can progress or recover it.
contract SagaDemo {
    struct Run {
        address owner;
        uint256 escrow;
        uint8 stage; // 0 absent, 1 funded, 2 advanced, 3 finished, 4 recovered
    }

    mapping(bytes32 => Run) public runs;

    event Transition(bytes32 indexed runId, uint8 stage, uint256 escrow);

    function start(bytes32 runId) external payable {
        require(runId != bytes32(0), "Empty run ID");
        require(msg.value > 0, "Escrow required");
        require(runs[runId].stage == 0, "Run already exists");
        runs[runId] = Run(msg.sender, msg.value, 1);
        emit Transition(runId, 1, msg.value);
    }

    function advance(bytes32 runId) external {
        Run storage run = runs[runId];
        require(run.owner == msg.sender, "Not run owner");
        require(run.stage == 1, "Start must confirm first");
        run.stage = 2;
        emit Transition(runId, 2, run.escrow);
    }

    function finish(bytes32 runId, bool forceFailure) external {
        Run storage run = runs[runId];
        require(run.owner == msg.sender, "Not run owner");
        require(run.stage == 2, "Advance must confirm first");
        require(!forceFailure, "Forced demo failure");
        uint256 refund = run.escrow;
        run.escrow = 0;
        run.stage = 3;
        emit Transition(runId, 3, 0);
        (bool sent,) = payable(msg.sender).call{value: refund}("");
        require(sent, "Refund failed");
    }

    function rewind(bytes32 runId) external {
        Run storage run = runs[runId];
        require(run.owner == msg.sender, "Not run owner");
        require(run.stage == 2, "Cannot rewind this stage");
        run.stage = 1;
        emit Transition(runId, 1, run.escrow);
    }

    function recover(bytes32 runId) external {
        Run storage run = runs[runId];
        require(run.owner == msg.sender, "Not run owner");
        require(run.stage == 1, "Rewind must confirm first");
        uint256 refund = run.escrow;
        run.escrow = 0;
        run.stage = 4;
        emit Transition(runId, 4, 0);
        (bool sent,) = payable(msg.sender).call{value: refund}("");
        require(sent, "Recovery refund failed");
    }
}
